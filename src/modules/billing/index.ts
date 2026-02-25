/**
 * Billing module — Stripe payments and subscription management.
 * D-11: No free tier, no freemium. 7-day trial, no credit card.
 * Plans: Alma $24.99, Familia $39.99, Premium $9.99 add-on.
 */

import type { AlmaConfig } from "../../config.js";
import type Database from "better-sqlite3";

export class BillingService {
  constructor(
    private config: AlmaConfig,
    private masterDb: Database.Database,
  ) {}

  /** Create Stripe customer and start trial */
  async startTrial(familyId: string, email?: string): Promise<void> {
    // TODO: Stripe customer creation, 7-day trial subscription
  }

  /** Check if family's trial has expired */
  isTrialExpired(familyId: string): boolean {
    // TODO: query master DB
    return false;
  }

  /** Handle Stripe webhook events */
  async handleWebhook(event: unknown): Promise<void> {
    // TODO: payment succeeded, failed, subscription updated, canceled
  }

  /** Check referral count for premium unlock */
  async checkPremiumEligibility(familyId: string): Promise<boolean> {
    // D-5: 3 active referrals = free premium
    const count = this.masterDb
      .prepare(
        "SELECT COUNT(*) as cnt FROM referrals WHERE referrer_family_id = ? AND status = 'active'",
      )
      .get(familyId) as { cnt: number } | undefined;

    return (count?.cnt ?? 0) >= 3;
  }
}
