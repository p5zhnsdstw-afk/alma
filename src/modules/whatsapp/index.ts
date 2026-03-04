/**
 * WhatsApp module — routes incoming messages to appropriate handlers.
 * MVP C: Delivery intent routing + bidirectional reply handling.
 *
 * Flow:
 * 1. Unregistered contact? → Check delivery_phones for family reply
 * 2. Onboarding? → State machine
 * 3. Pending delivery phone? → Resolve phone number
 * 4. Recipient with pending deliveries? → Route reply
 * 5. Special commands (calendar, briefing)
 * 6. Normal: capture (delivery intent → create delivery) + LLM respond
 */

import type { AlmaConfig } from "../../config.js";
import type { MessageProvider, IncomingMessage } from "./provider.js";
import { CloudAPIProvider } from "./cloud-api.js";
import type { LLMService } from "../llm/index.js";
import type { UserService } from "../users/index.js";
import type { CaptureService } from "../capture/index.js";
import type { BriefingService } from "../briefing/index.js";
import type { NudgeService } from "../nudge/index.js";
import type { CalendarService } from "../calendar/index.js";
import type { TaskService } from "../tasks/index.js";
import type { BillingService } from "../billing/index.js";
import type { DeliveryService } from "../delivery/index.js";
import { ONBOARDING_STEPS } from "../users/index.js";
import { log } from "../../utils/logger.js";
import { withRetry, isHttpRetryable } from "../../utils/retry.js";

const MOD = "whatsapp";
const MAX_MESSAGE_LENGTH = 4096;

interface Services {
  llm: LLMService;
  users: UserService;
  capture: CaptureService;
  briefing: BriefingService;
  nudge: NudgeService;
  calendar: CalendarService;
  tasks: TaskService;
  billing: BillingService;
  delivery: DeliveryService;
}

export class WhatsAppRouter {
  private provider: MessageProvider;
  private services: Services;
  private config: AlmaConfig;

  constructor(config: AlmaConfig, services: Services) {
    this.config = config;
    this.services = services;

    // ADR-003: swap provider here for dev vs prod
    this.provider = new CloudAPIProvider({
      phoneNumberId: config.whatsapp.phoneNumberId,
      accessToken: config.whatsapp.accessToken,
      verifyToken: config.whatsapp.verifyToken,
      appSecret: config.whatsapp.appSecret,
    });
  }

  async start(): Promise<void> {
    this.provider.onMessage(async (msg) => {
      await this.handleMessage(msg);
    });
    await this.provider.start(this.config.port);
    log.info(MOD, "WhatsApp router started", { port: this.config.port });
  }

  /** Expose provider for cron scripts (briefings, nudges, deliveries) */
  getProvider(): MessageProvider {
    return this.provider;
  }

  /** Wire OAuth callback for calendar connect (provider-specific) */
  setOAuthCallback(handler: (code: string, state: string) => Promise<string>): void {
    if ("onOAuthCallback" in this.provider) {
      (this.provider as CloudAPIProvider).onOAuthCallback(handler);
    }
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    const startTime = Date.now();

    try {
      // Mark as read immediately (non-blocking — don't fail the whole flow)
      this.provider.markRead(msg.id).catch((e) =>
        log.warn(MOD, "markRead failed", { error: String(e) }),
      );

      const text = (msg.text ?? "").slice(0, MAX_MESSAGE_LENGTH);
      const user = await this.services.users.resolveUser(msg.from);

      // ── Unregistered contact? Check if they're replying to a delivery ────
      if (!user) {
        const handled = await this.handleUnregisteredReply(msg.from, text);
        if (handled) return;

        // New user — start onboarding
        await this.services.users.startOnboarding(msg.from, this.provider);
        return;
      }

      // ── Still onboarding? Route to state machine ────────────────────────
      if (user.onboardingStep >= 0) {
        const response = await this.services.users.processOnboarding(user, text, this.provider);
        if (response) {
          await this.safeSend(msg.from, response, msg.id);
        }
        return;
      }

      const familyDb = this.services.users.getFamilyDb(user.familyId);

      // ── Store episode for conversation memory ──────────────────────────
      this.storeEpisode(familyDb, user.id, "user", text);

      // ── Pending delivery phone resolution? ──────────────────────────────
      const phoneResolution = await this.services.delivery.resolvePendingDelivery(user, text, familyDb);
      if (phoneResolution) {
        await this.safeSend(msg.from, phoneResolution, msg.id);
        return;
      }

      // ── Recipient with pending deliveries? Route reply ──────────────────
      const pendingForMe = this.services.delivery.getPendingForRecipient(familyDb, user.id);
      if (pendingForMe.length > 0) {
        const result = await this.services.delivery.handleRecipientReply(
          user.phone, user.name.split(" ")[0], text, familyDb,
        );
        if (result.handled) {
          if (result.response) await this.safeSend(msg.from, result.response);
          if (result.senderNotification && result.senderPhone) {
            await this.safeSend(result.senderPhone, result.senderNotification);
          }
          return;
        }
      }

      // ── Special commands ────────────────────────────────────────────────
      const lower = text.toLowerCase().trim();

      if (lower === "conectar calendario" || lower === "connect calendar") {
        await this.handleCalendarConnect(user);
        return;
      }

      if (lower === "mi briefing" || lower === "briefing" || lower === "my briefing") {
        const briefing = await this.services.briefing.generateMorningBriefing(user.id);
        await this.safeSend(msg.from, briefing);
        return;
      }

      // ── Onboarding escape: "skip" / "saltar" anytime ───────────────────
      if (lower === "skip" || lower === "saltar") {
        // No-op for fully onboarded users — just respond normally
      }

      // ── Normal conversation: capture → maybe delivery → LLM respond ─────
      const captured = await this.services.capture.process(msg, user, familyDb);

      // Handle transcription failure
      if (captured?.kind === "item" && captured.title === "__transcription_failed__") {
        const failMsg = user.language === "es"
          ? "No pude entender tu nota de voz. ¿Puedes escribirlo?"
          : "I couldn't understand your voice note. Can you type it instead?";
        await this.safeSend(msg.from, failMsg, msg.id);
        return;
      }

      // If capture detected a delivery intent, create the delivery
      if (captured?.kind === "delivery") {
        const { senderMessage } = await this.services.delivery.createDelivery(
          captured, user, familyDb,
        );
        await this.safeSend(msg.from, senderMessage, msg.id);
        this.storeEpisode(familyDb, user.id, "assistant", senderMessage);
        return;
      }

      // Normal LLM response (with conversation context)
      const recentEpisodes = this.getRecentEpisodes(familyDb, user.id, 5);
      const response = await this.services.llm.respond({
        message: msg,
        user,
        familyDb,
        captured,
        recentEpisodes,
      });

      if (response && response.trim()) {
        await this.safeSend(msg.from, response, msg.id);
        this.storeEpisode(familyDb, user.id, "assistant", response);
      }
    } catch (error) {
      log.error(MOD, "handleMessage failed", error, { from: msg.from, type: msg.type });

      // Send a graceful error message to user
      try {
        await this.provider.send({
          to: msg.from,
          text: "Disculpa, tuve un problema procesando tu mensaje. ¿Puedes intentar de nuevo?",
        });
      } catch {
        // Last resort — can't even send error message
      }
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed > 5000) {
        log.warn(MOD, "slow message processing", { elapsed, from: msg.from });
      }
    }
  }

  /**
   * Handle a message from an unregistered phone number.
   * Checks delivery_phones to see if they're a family contact replying to a delivery.
   */
  private async handleUnregisteredReply(phone: string, text: string): Promise<boolean> {
    try {
      const deliveryPhone = (this.services.users as any).masterDb
        .prepare("SELECT * FROM delivery_phones WHERE phone = ?")
        .get(phone) as { family_id: string; contact_name: string } | undefined;

      if (!deliveryPhone) return false;

      // Validate the family exists
      const familyExists = (this.services.users as any).masterDb
        .prepare("SELECT id FROM families WHERE id = ?")
        .get(deliveryPhone.family_id);

      if (!familyExists) {
        log.warn(MOD, "delivery_phones points to non-existent family", {
          phone: phone.slice(0, 6) + "...",
          familyId: deliveryPhone.family_id,
        });
        return false;
      }

      const familyDb = this.services.users.getFamilyDb(deliveryPhone.family_id);

      // Verify there are actually pending deliveries for this phone
      const hasPending = this.services.delivery.getPendingForRecipient(familyDb, phone);
      if (hasPending.length === 0) return false;

      const result = await this.services.delivery.handleRecipientReply(
        phone, deliveryPhone.contact_name, text, familyDb,
      );

      if (!result.handled) return false;

      if (result.response) await this.safeSend(phone, result.response);
      if (result.senderNotification && result.senderPhone) {
        await this.safeSend(result.senderPhone, result.senderNotification);
      }

      return true;
    } catch (error) {
      log.error(MOD, "handleUnregisteredReply failed", error, { phone: phone.slice(0, 6) + "..." });
      return false;
    }
  }

  /** Handle "connect calendar" command */
  private async handleCalendarConnect(user: { id: string; phone: string; language: string; calendarProvider: string | null }): Promise<void> {
    if (user.calendarProvider) {
      await this.safeSend(
        user.phone,
        `Ya tienes ${user.calendarProvider === "google" ? "Google" : "Apple"} Calendar conectado. Todo sincronizado.`,
      );
      return;
    }

    await this.safeSend(
      user.phone,
      "¿Cuál calendario usas?\n\n1. Google Calendar\n2. Apple Calendar (iCloud)\n\nResponde con el número o el nombre.",
    );
  }

  // ── Conversation Memory ─────────────────────────────────────────────────

  private storeEpisode(familyDb: Database.Database, userId: string, role: string, content: string): void {
    try {
      familyDb
        .prepare(
          `INSERT INTO episodes (id, user_id, role, content, created_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        )
        .run(crypto.randomUUID(), userId, role, content.slice(0, 2000));

      // Prune old episodes — keep last 100 per user
      familyDb
        .prepare(
          `DELETE FROM episodes WHERE user_id = ? AND id NOT IN (
             SELECT id FROM episodes WHERE user_id = ?
             ORDER BY created_at DESC LIMIT 100
           )`,
        )
        .run(userId, userId);
    } catch (error) {
      log.warn(MOD, "failed to store episode", { error: String(error) });
    }
  }

  private getRecentEpisodes(
    familyDb: Database.Database,
    userId: string,
    limit: number,
  ): Array<{ role: string; content: string }> {
    try {
      const rows = familyDb
        .prepare(
          `SELECT role, content FROM episodes
           WHERE user_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(userId, limit) as Array<{ role: string; content: string }>;

      return rows.reverse(); // chronological order
    } catch {
      return [];
    }
  }

  // ── Safe Send (with retry) ──────────────────────────────────────────────

  private async safeSend(to: string, text: string, replyTo?: string): Promise<void> {
    if (!text || !text.trim()) {
      log.warn(MOD, "attempted to send empty message", { to: to.slice(0, 6) + "..." });
      return;
    }

    try {
      await withRetry(
        () => this.provider.send({ to, text, replyTo }),
        { maxRetries: 2, baseDelayMs: 500, module: MOD, operation: "send", isRetryable: isHttpRetryable },
      );
    } catch (error) {
      log.error(MOD, "safeSend failed after retries", error, { to: to.slice(0, 6) + "..." });
    }
  }
}

export type { MessageProvider, IncomingMessage, OutgoingMessage } from "./provider.js";

// Type augmentation for LLM respond context
import type Database from "better-sqlite3";
