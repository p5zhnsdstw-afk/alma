/**
 * Billing module — Paddle (Merchant of Record) payments and subscriptions.
 * D-11: No free tier, no freemium. 7-day trial, no credit card.
 * Plans: Alma $24.99/mo, Familia $39.99/mo, Premium $9.99/mo add-on.
 *
 * Paddle handles tax, compliance, and invoicing as MoR.
 * We use the Paddle Billing API v1 (REST, no SDK needed).
 */

import type { AlmaConfig } from "../../config.js";
import type Database from "better-sqlite3";
import { log } from "../../utils/logger.js";
import crypto from "node:crypto";

const MOD = "billing";
const TRIAL_DAYS = 7;

type PaddleEnvironment = "sandbox" | "production";

const PADDLE_API_BASE: Record<PaddleEnvironment, string> = {
  sandbox: "https://sandbox-api.paddle.com",
  production: "https://api.paddle.com",
};

interface PaddleCustomer {
  id: string;
  email: string;
}

interface PaddleSubscription {
  id: string;
  status: string;
  current_billing_period?: {
    ends_at: string;
  };
}

export class BillingService {
  private readonly apiBase: string;

  constructor(
    private readonly config: AlmaConfig,
    private readonly masterDb: Database.Database,
  ) {
    this.apiBase = PADDLE_API_BASE[config.paddle.environment];
  }

  /** Start 7-day trial for a new family (no payment method needed) */
  async startTrial(familyId: string, email?: string): Promise<void> {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Create Paddle customer if email provided
    let paddleCustomerId: string | null = null;
    if (email && this.config.paddle.apiKey) {
      try {
        const customer = await this.createPaddleCustomer(email);
        paddleCustomerId = customer.id;
        log.info(MOD, "paddle customer created", { familyId, customerId: customer.id });
      } catch (error) {
        log.error(MOD, "failed to create paddle customer", error);
        // Continue — trial works without Paddle customer
      }
    }

    this.masterDb
      .prepare(
        `UPDATE families
         SET plan = 'trial', trial_ends_at = ?, paddle_customer_id = ?
         WHERE id = ?`,
      )
      .run(trialEndsAt, paddleCustomerId, familyId);

    log.info(MOD, "trial started", { familyId, trialEndsAt });
  }

  /** Check if family's trial has expired */
  isTrialExpired(familyId: string): boolean {
    const row = this.masterDb
      .prepare("SELECT plan, trial_ends_at FROM families WHERE id = ?")
      .get(familyId) as { plan: string; trial_ends_at: string | null } | undefined;

    if (!row) return true;
    if (row.plan !== "trial") return false; // Active subscriber
    if (!row.trial_ends_at) return true;

    return new Date(row.trial_ends_at) < new Date();
  }

  /** Generate a Paddle Checkout URL for the user to subscribe */
  async getCheckoutUrl(familyId: string, plan: "alma" | "familia"): Promise<string | null> {
    const priceId = this.config.paddle.priceIds[plan];
    if (!priceId || !this.config.paddle.apiKey) return null;

    const row = this.masterDb
      .prepare("SELECT paddle_customer_id FROM families WHERE id = ?")
      .get(familyId) as { paddle_customer_id: string | null } | undefined;

    try {
      // Paddle Checkout overlay — generate transaction
      const body: Record<string, unknown> = {
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: { family_id: familyId },
      };
      if (row?.paddle_customer_id) {
        body.customer_id = row.paddle_customer_id;
      }

      const res = await this.paddleRequest("POST", "/transactions", body);
      const checkoutUrl = res?.data?.checkout?.url as string | undefined;
      return checkoutUrl ?? null;
    } catch (error) {
      log.error(MOD, "failed to create checkout", error);
      return null;
    }
  }

  /** Handle Paddle webhook notification */
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    // Verify webhook signature (Paddle uses ts + h1 format)
    if (!this.verifyWebhookSignature(rawBody, signature)) {
      log.warn(MOD, "webhook signature verification failed");
      return;
    }

    const event = JSON.parse(rawBody) as {
      event_type: string;
      data: Record<string, unknown>;
    };

    const eventType = event.event_type;
    log.info(MOD, "webhook received", { eventType });

    switch (eventType) {
      case "subscription.activated":
      case "subscription.updated":
        await this.handleSubscriptionUpdate(event.data);
        break;
      case "subscription.canceled":
        await this.handleSubscriptionCanceled(event.data);
        break;
      case "transaction.completed":
        await this.handleTransactionCompleted(event.data);
        break;
      default:
        log.info(MOD, "unhandled webhook event", { eventType });
    }
  }

  /** Check referral count for premium unlock */
  checkPremiumEligibility(familyId: string): boolean {
    // D-5: 3 active referrals = free premium
    const count = this.masterDb
      .prepare(
        "SELECT COUNT(*) as cnt FROM referrals WHERE referrer_family_id = ? AND status = 'active'",
      )
      .get(familyId) as { cnt: number } | undefined;

    return (count?.cnt ?? 0) >= 3;
  }

  /** Get family's current plan info */
  getPlanInfo(familyId: string): { plan: string; active: boolean; trialDaysLeft: number } {
    const row = this.masterDb
      .prepare("SELECT plan, trial_ends_at FROM families WHERE id = ?")
      .get(familyId) as { plan: string; trial_ends_at: string | null } | undefined;

    if (!row) return { plan: "none", active: false, trialDaysLeft: 0 };

    if (row.plan === "trial") {
      const daysLeft = row.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(row.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : 0;
      return { plan: "trial", active: daysLeft > 0, trialDaysLeft: daysLeft };
    }

    return { plan: row.plan, active: true, trialDaysLeft: 0 };
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async createPaddleCustomer(email: string): Promise<PaddleCustomer> {
    const res = await this.paddleRequest("POST", "/customers", { email });
    return res.data as PaddleCustomer;
  }

  private async handleSubscriptionUpdate(data: Record<string, unknown>): Promise<void> {
    const customData = data.custom_data as { family_id?: string } | undefined;
    const familyId = customData?.family_id;
    if (!familyId) {
      log.warn(MOD, "subscription update missing family_id in custom_data");
      return;
    }

    const subscriptionId = data.id as string;
    const status = data.status as string;
    const plan = this.inferPlanFromItems(data);

    this.masterDb
      .prepare(
        `UPDATE families
         SET plan = ?, paddle_subscription_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(plan, subscriptionId, familyId);

    this.recordBillingEvent(familyId, status === "active" ? "payment" : "upgrade", data.id as string);
    log.info(MOD, "subscription updated", { familyId, plan, status });
  }

  private async handleSubscriptionCanceled(data: Record<string, unknown>): Promise<void> {
    const customData = data.custom_data as { family_id?: string } | undefined;
    const familyId = customData?.family_id;
    if (!familyId) return;

    this.masterDb
      .prepare(
        `UPDATE families
         SET plan = 'trial', paddle_subscription_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(familyId);

    this.recordBillingEvent(familyId, "churn", data.id as string);
    log.info(MOD, "subscription canceled", { familyId });
  }

  private async handleTransactionCompleted(data: Record<string, unknown>): Promise<void> {
    const customData = data.custom_data as { family_id?: string } | undefined;
    const familyId = customData?.family_id;
    if (!familyId) return;

    const totals = data.details as { totals?: { total?: string } } | undefined;
    const amountCents = totals?.totals?.total ? Math.round(Number(totals.totals.total)) : 0;

    this.recordBillingEvent(familyId, "payment", data.id as string, amountCents);
  }

  private inferPlanFromItems(data: Record<string, unknown>): string {
    const items = data.items as Array<{ price?: { id?: string } }> | undefined;
    if (!items?.length) return "alma";

    const priceId = items[0]?.price?.id;
    if (priceId === this.config.paddle.priceIds.familia) return "familia";
    return "alma";
  }

  private recordBillingEvent(
    familyId: string,
    eventType: string,
    paddleEventId: string,
    amountCents?: number,
  ): void {
    this.masterDb
      .prepare(
        `INSERT INTO billing_events (family_id, event_type, amount_cents, paddle_event_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(familyId, eventType, amountCents ?? null, paddleEventId);
  }

  private verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.config.paddle.webhookSecret) return true; // Skip in dev

    try {
      // Paddle signature format: ts=xxx;h1=xxx
      const parts = Object.fromEntries(
        signatureHeader.split(";").map((p) => p.split("=") as [string, string]),
      );
      const ts = parts.ts;
      const h1 = parts.h1;
      if (!ts || !h1) return false;

      const payload = `${ts}:${rawBody}`;
      const expected = crypto
        .createHmac("sha256", this.config.paddle.webhookSecret)
        .update(payload)
        .digest("hex");

      return crypto.timingSafeEqual(Buffer.from(h1), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  private async paddleRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ data: unknown }> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.paddle.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      throw new Error(`Paddle API ${res.status}: ${errorText.slice(0, 200)}`);
    }

    return (await res.json()) as { data: unknown };
  }
}
