/**
 * Delivery module — MVP C "La Que Manda" core loop.
 * Job Story: "When I need my family to do something, I want to tell Alma once
 * and have her deliver the message at the right time and follow up,
 * so I can stop being the family nag."
 *
 * Lifecycle: pending → scheduled → delivered → confirmed | expired | failed
 * NBR-1 compliance: every message counts toward 5/day limit (DB-persisted).
 */

import type Database from "better-sqlite3";
import type { LLMService, LLMMessage } from "../llm/index.js";
import type { UserService, User } from "../users/index.js";
import type { MessageProvider } from "../whatsapp/provider.js";
import { log } from "../../utils/logger.js";
import { parseLLMJson, validateDeliveryIntent, validateReplyClassification } from "../../utils/llm-parse.js";
import { extractPhone, isValidE164 } from "../../utils/phone.js";
import { withRetry, isHttpRetryable, PermanentError } from "../../utils/retry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeliveryIntent {
  readonly kind: "delivery";
  readonly who: string;
  readonly what: string;
  readonly when: string | null; // "20:00", "mañana a las 9", or null (immediate)
  readonly raw: string;
}

export interface Delivery {
  readonly id: string;
  readonly senderId: string;
  readonly recipientId: string | null;
  readonly recipientName: string;
  readonly recipientPhone: string | null;
  readonly messageBody: string;
  readonly status: DeliveryStatus;
  readonly deliverAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly confirmationText: string | null;
  readonly followupCount: number;
  readonly expiresAt: Date | null;
}

type DeliveryStatus = "pending" | "scheduled" | "delivered" | "confirmed" | "expired" | "failed";

export interface DeliveryStats {
  readonly sentYesterday: number;
  readonly confirmedYesterday: number;
  readonly pendingNow: number;
}

interface ReplyResult {
  readonly handled: boolean;
  readonly response: string | null;
  readonly senderNotification: string | null;
  readonly senderPhone: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FOLLOWUP_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours
const EXPIRY_DELAY_MS = 24 * 60 * 60 * 1000;   // 24 hours
const MAX_FOLLOWUPS = 2;
const MAX_DAILY_NUDGES = 5;
const MAX_MESSAGE_LENGTH = 4096;
const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h for unresolved pending deliveries
const MOD = "delivery";

// ─── Service ────────────────────────────────────────────────────────────────

export class DeliveryService {
  constructor(
    private llm: LLMService,
    private users: UserService,
  ) {}

  // ── Nudge Rate Limiting (DB-persisted, survives restarts) ───────────────

  private canNudge(familyDb: Database.Database, userId: string, userTimezone: string): boolean {
    const today = this.todayInTimezone(userTimezone);
    const row = familyDb
      .prepare("SELECT count FROM nudge_counts WHERE user_id = ? AND date = ?")
      .get(userId, today) as { count: number } | undefined;

    return !row || row.count < MAX_DAILY_NUDGES;
  }

  private recordNudge(familyDb: Database.Database, userId: string, userTimezone: string): boolean {
    const today = this.todayInTimezone(userTimezone);
    const row = familyDb
      .prepare("SELECT count FROM nudge_counts WHERE user_id = ? AND date = ?")
      .get(userId, today) as { count: number } | undefined;

    if (row && row.count >= MAX_DAILY_NUDGES) return false;

    familyDb
      .prepare(
        `INSERT INTO nudge_counts (user_id, date, count)
         VALUES (?, ?, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`,
      )
      .run(userId, today);

    return true;
  }

  private todayInTimezone(timezone: string): string {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  }

  // ── Intent Detection ────────────────────────────────────────────────────

  /**
   * Detect if a message contains a delivery intent (request to send message to someone).
   * Uses LLM with low temperature for reliable structured output.
   */
  async detectIntent(text: string, user: User): Promise<DeliveryIntent | null> {
    if (!text.trim() || text.length > MAX_MESSAGE_LENGTH) return null;

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: [
          "Analyze this message for DELIVERY INTENT — a request to send a message, reminder, or instruction to another person.",
          "",
          "Delivery intent indicators:",
          '- "dile a [person]", "dígale a [person]", "tell [person]"',
          '- "avísale a [person]", "recuérdale a [person]", "remind [person]"',
          '- "mándale mensaje a [person]"',
          '- Implicit: "[person] tiene que [action]", "[person] necesita [action]"',
          "",
          "Output ONLY valid JSON, no markdown, no explanation.",
          'If NO delivery intent: {"intent":false}',
          'If delivery intent: {"intent":true,"who":"Pedro","what":"saca la basura","when":"20:00"}',
          '"what" = the action/message for the recipient, phrased as an instruction.',
          '"when" = delivery time if specified (HH:MM or relative like "mañana a las 9"), null if now or unspecified.',
        ].join("\n"),
      },
      { role: "user", content: text },
    ];

    try {
      const response = await this.llm.generate(messages, { temperature: 0.2, maxTokens: 150, disableThinking: true });
      const parsed = parseLLMJson(
        response.text,
        validateDeliveryIntent,
        { intent: false },
        MOD,
      );

      if (!parsed.intent || !parsed.who || !parsed.what) return null;

      return {
        kind: "delivery",
        who: parsed.who,
        what: parsed.what.slice(0, 500), // cap message body length
        when: parsed.when ?? null,
        raw: text,
      };
    } catch (error) {
      log.error(MOD, "detectIntent failed", error);
      return null;
    }
  }

  // ── Delivery Creation ───────────────────────────────────────────────────

  /**
   * Create a delivery from a detected intent.
   * Resolves recipient, schedules delivery, returns confirmation message for sender.
   */
  async createDelivery(
    intent: DeliveryIntent,
    sender: User,
    familyDb: Database.Database,
  ): Promise<{ delivery: Delivery; senderMessage: string }> {
    const id = crypto.randomUUID();

    // Resolve recipient from family contacts
    const contact = this.users.resolveContactByName(familyDb, intent.who);
    const recipientPhone = contact?.phone ?? null;
    const recipientId = contact?.userId ?? null;

    // Check if recipient opted out
    if (contact?.optedOut) {
      return {
        delivery: this.rowToDelivery({
          id, sender_id: sender.id, status: "failed",
          recipient_name: intent.who, message_body: intent.what,
          original_text: intent.raw,
        }),
        senderMessage: sender.language === "es"
          ? `${intent.who} prefirió no recibir mensajes de Alma. Tendrás que decírselo directamente.`
          : `${intent.who} opted out of receiving messages from Alma. You'll need to tell them directly.`,
      };
    }

    // Parse delivery time (timezone-aware)
    const deliverAt = this.parseDeliveryTime(intent.when, sender.timezone);
    const isImmediate = !deliverAt || deliverAt.getTime() <= Date.now() + 60_000;
    const effectiveDeliverAt = isImmediate ? new Date() : deliverAt!;
    const expiresAt = new Date(effectiveDeliverAt.getTime() + EXPIRY_DELAY_MS);

    // Determine initial status
    const status: DeliveryStatus = recipientPhone ? "scheduled" : "pending";

    // Use transaction for atomicity
    familyDb.transaction(() => {
      familyDb
        .prepare(
          `INSERT INTO deliveries (id, sender_id, recipient_id, recipient_name, recipient_phone,
            message_body, original_text, status, deliver_at, expires_at, max_followups)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id, sender.id, recipientId, intent.who, recipientPhone,
          intent.what, intent.raw, status,
          effectiveDeliverAt.toISOString(), expiresAt.toISOString(), MAX_FOLLOWUPS,
        );

      if (status === "pending") {
        familyDb
          .prepare(
            `INSERT OR REPLACE INTO preferences (key, value, updated_at)
             VALUES ('pending_delivery_id', ?, CURRENT_TIMESTAMP)`,
          )
          .run(id);
      }
    })();

    const delivery = this.getDelivery(familyDb, id)!;

    // Build confirmation message for sender
    const senderMessage = this.buildSenderConfirmation(
      status, isImmediate, intent.who, effectiveDeliverAt, sender,
    );

    log.info(MOD, "delivery created", {
      id, status, recipientName: intent.who, senderId: sender.id,
      isImmediate, deliverAt: effectiveDeliverAt.toISOString(),
    });

    return { delivery, senderMessage };
  }

  /**
   * Resolve a pending delivery when sender provides a phone number.
   */
  async resolvePendingDelivery(
    sender: User,
    text: string,
    familyDb: Database.Database,
  ): Promise<string | null> {
    const pending = familyDb
      .prepare("SELECT value FROM preferences WHERE key = 'pending_delivery_id'")
      .get() as { value: string } | undefined;

    if (!pending) return null;

    // Extract and validate phone number (E.164)
    const phone = extractPhone(text, this.getDefaultCountryCode(sender));
    if (!phone) return null;

    const deliveryId = pending.value;

    const delivery = familyDb
      .prepare("SELECT * FROM deliveries WHERE id = ? AND status = 'pending'")
      .get(deliveryId) as Record<string, unknown> | undefined;

    if (!delivery) {
      // Clean up stale pending
      familyDb.prepare("DELETE FROM preferences WHERE key = 'pending_delivery_id'").run();
      return null;
    }

    const recipientName = delivery.recipient_name as string;

    // Atomic: update contact + delivery + clear pending
    familyDb.transaction(() => {
      this.users.upsertContact(familyDb, { name: recipientName, phone });

      familyDb
        .prepare(
          `UPDATE deliveries SET recipient_phone = ?, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'pending'`,
        )
        .run(phone, deliveryId);

      familyDb.prepare("DELETE FROM preferences WHERE key = 'pending_delivery_id'").run();
    })();

    // Register in master DB for reverse lookup
    this.registerDeliveryPhone(phone, sender.familyId, recipientName);

    const isImmediate = delivery.deliver_at
      ? new Date(delivery.deliver_at as string).getTime() <= Date.now() + 60_000
      : true;

    log.info(MOD, "pending delivery resolved", { deliveryId, recipientName, phone: phone.slice(0, 6) + "..." });

    if (isImmediate) {
      return sender.language === "es"
        ? `Perfecto, le aviso a ${recipientName} ahora mismo.`
        : `Perfect, I'll tell ${recipientName} right now.`;
    }

    const deliverAt = new Date(delivery.deliver_at as string);
    const timeStr = this.formatTimeInTimezone(deliverAt, sender.timezone, sender.language);

    return sender.language === "es"
      ? `Perfecto, le aviso a ${recipientName} a las ${timeStr}.`
      : `Perfect, I'll tell ${recipientName} at ${timeStr}.`;
  }

  // ── Scheduled Delivery Processing (cron) ────────────────────────────────

  /**
   * Process all scheduled deliveries that are due. Called every ~60s.
   * Uses UPDATE-first claiming pattern to prevent concurrent processing.
   */
  async processScheduledDeliveries(
    familyId: string,
    familyDb: Database.Database,
    provider: MessageProvider,
  ): Promise<number> {
    const now = new Date().toISOString();

    // Claim due deliveries atomically: UPDATE status to 'delivering' (prevents double-send)
    // Since SQLite doesn't support RETURNING, we use a two-step: claim then read
    const claimResult = familyDb
      .prepare(
        `UPDATE deliveries SET status = 'delivering', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'scheduled' AND deliver_at <= ?`,
      )
      .run(now);

    if (claimResult.changes === 0) return 0;

    const claimed = familyDb
      .prepare("SELECT * FROM deliveries WHERE status = 'delivering'")
      .all() as Array<Record<string, unknown>>;

    let sent = 0;

    for (const row of claimed) {
      const recipientPhone = row.recipient_phone as string;
      if (!recipientPhone || !isValidE164(recipientPhone)) {
        this.markFailed(familyDb, row.id as string, "invalid_phone");
        continue;
      }

      // Check rate limit
      const recipientId = (row.recipient_id as string) ?? recipientPhone;
      const senderUser = await this.users.getUser(row.sender_id as string);
      const timezone = senderUser?.timezone ?? "America/Guayaquil";

      if (!this.canNudge(familyDb, recipientId, timezone)) {
        // Put back to scheduled — will retry next tick when rate limit resets
        familyDb.prepare("UPDATE deliveries SET status = 'scheduled' WHERE id = ?").run(row.id as string);
        continue;
      }

      const senderName = senderUser?.name.split(" ")[0] ?? "tu familia";
      const recipientName = row.recipient_name as string;
      const messageBody = row.message_body as string;

      const composedMessage = await this.composeDeliveryMessage(
        senderName, recipientName, messageBody,
        senderUser?.language ?? "es",
        this.isFirstContact(familyDb, recipientPhone),
      );

      try {
        const waMessageId = await withRetry(
          () => provider.send({ to: recipientPhone, text: composedMessage }),
          { maxRetries: 3, baseDelayMs: 1000, module: MOD, operation: `send-delivery-${row.id}`, isRetryable: isHttpRetryable },
        );

        this.recordNudge(familyDb, recipientId, timezone);

        const followupAt = new Date(Date.now() + FOLLOWUP_DELAY_MS).toISOString();
        familyDb
          .prepare(
            `UPDATE deliveries SET
              status = 'delivered',
              delivered_at = CURRENT_TIMESTAMP,
              delivery_wa_message_id = ?,
              next_followup_at = ?,
              updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .run(waMessageId, followupAt, row.id as string);

        this.markFirstContact(familyDb, recipientPhone);
        sent++;

        log.info(MOD, "delivery sent", { deliveryId: row.id, recipientName });
      } catch (error) {
        log.error(MOD, "delivery send failed", error, { deliveryId: row.id, recipientName });
        this.markFailed(familyDb, row.id as string, "send_error");

        // Notify sender about failure
        if (senderUser) {
          this.notifySenderOfFailure(senderUser, recipientName, messageBody, provider).catch(
            (e) => log.error(MOD, "failed to notify sender of delivery failure", e),
          );
        }
      }
    }

    return sent;
  }

  // ── Follow-up Processing (cron) ─────────────────────────────────────────

  /**
   * Re-nudge recipients who haven't confirmed. Called every ~60s.
   */
  async processFollowups(
    familyDb: Database.Database,
    provider: MessageProvider,
  ): Promise<number> {
    const now = new Date().toISOString();
    const pending = familyDb
      .prepare(
        `SELECT * FROM deliveries
         WHERE status = 'delivered'
         AND next_followup_at IS NOT NULL
         AND next_followup_at <= ?
         AND followup_count < max_followups`,
      )
      .all(now) as Array<Record<string, unknown>>;

    let sent = 0;

    for (const row of pending) {
      const recipientPhone = row.recipient_phone as string;
      const recipientId = (row.recipient_id as string) ?? recipientPhone;
      const senderUser = await this.users.getUser(row.sender_id as string);
      const timezone = senderUser?.timezone ?? "America/Guayaquil";

      if (!recipientPhone || !this.canNudge(familyDb, recipientId, timezone)) continue;

      const recipientName = row.recipient_name as string;
      const messageBody = row.message_body as string;
      const count = row.followup_count as number;
      const language = senderUser?.language ?? "es";

      const followupMsg = count === 0
        ? (language === "es"
          ? `Hola ${recipientName}, recordatorio: ${messageBody}. Avísame cuando lo hagas.`
          : `Hi ${recipientName}, reminder: ${messageBody}. Let me know when it's done.`)
        : (language === "es"
          ? `${recipientName}, último recordatorio: ${messageBody}.`
          : `${recipientName}, final reminder: ${messageBody}.`);

      try {
        await withRetry(
          () => provider.send({ to: recipientPhone, text: followupMsg }),
          { maxRetries: 2, baseDelayMs: 1000, module: MOD, operation: `followup-${row.id}`, isRetryable: isHttpRetryable },
        );

        this.recordNudge(familyDb, recipientId, timezone);

        const nextFollowup = count + 1 < MAX_FOLLOWUPS
          ? new Date(Date.now() + FOLLOWUP_DELAY_MS * 2).toISOString()
          : null;

        familyDb
          .prepare(
            `UPDATE deliveries SET
              followup_count = followup_count + 1,
              next_followup_at = ?,
              updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .run(nextFollowup, row.id as string);

        sent++;
        log.info(MOD, "followup sent", { deliveryId: row.id, recipientName, count: count + 1 });
      } catch (error) {
        log.error(MOD, "followup send failed", error, { deliveryId: row.id, recipientName });
      }
    }

    return sent;
  }

  // ── Expiration Processing (cron) ────────────────────────────────────────

  /**
   * Expire old unconfirmed deliveries + orphaned pending deliveries.
   */
  async processExpirations(
    familyDb: Database.Database,
    provider: MessageProvider,
  ): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;

    // Expire delivered but unconfirmed
    const expired = familyDb
      .prepare(
        `SELECT * FROM deliveries
         WHERE status = 'delivered' AND expires_at <= ?`,
      )
      .all(now) as Array<Record<string, unknown>>;

    for (const row of expired) {
      familyDb
        .prepare("UPDATE deliveries SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(row.id as string);

      // Notify sender
      const sender = await this.users.getUser(row.sender_id as string);
      if (sender && this.canNudge(familyDb, sender.id, sender.timezone)) {
        const recipientName = row.recipient_name as string;
        const msg = sender.language === "es"
          ? `${recipientName} no respondió a tu mensaje sobre "${row.message_body as string}". Quizá tendrás que hablarle directamente.`
          : `${recipientName} didn't respond to your message about "${row.message_body as string}". You might need to talk to them directly.`;

        try {
          await provider.send({ to: sender.phone, text: msg });
          this.recordNudge(familyDb, sender.id, sender.timezone);
        } catch (error) {
          log.error(MOD, "expiration notify failed", error, { deliveryId: row.id });
        }
      }
      count++;
    }

    // Expire orphaned pending deliveries (phone never provided after 24h)
    const pendingExpiry = new Date(Date.now() - PENDING_EXPIRY_MS).toISOString();
    const orphaned = familyDb
      .prepare(
        `SELECT * FROM deliveries
         WHERE status = 'pending' AND created_at <= ?`,
      )
      .all(pendingExpiry) as Array<Record<string, unknown>>;

    for (const row of orphaned) {
      familyDb
        .prepare("UPDATE deliveries SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(row.id as string);

      const sender = await this.users.getUser(row.sender_id as string);
      if (sender) {
        const recipientName = row.recipient_name as string;
        const msg = sender.language === "es"
          ? `No recibí el número de ${recipientName}, así que cancelé el mensaje. Puedes intentar de nuevo cuando quieras.`
          : `I didn't receive ${recipientName}'s number, so I cancelled the message. You can try again anytime.`;

        try {
          await provider.send({ to: sender.phone, text: msg });
        } catch (error) {
          log.error(MOD, "orphan expiry notify failed", error, { deliveryId: row.id });
        }
      }

      // Clean pending_delivery_id if it points to this delivery
      familyDb
        .prepare("DELETE FROM preferences WHERE key = 'pending_delivery_id' AND value = ?")
        .run(row.id as string);

      count++;
    }

    return count;
  }

  // ── Bidirectional Reply Handling ────────────────────────────────────────

  /**
   * Get pending (delivered but unconfirmed) deliveries for a recipient.
   */
  getPendingForRecipient(familyDb: Database.Database, recipientIdentifier: string): Array<Record<string, unknown>> {
    return familyDb
      .prepare(
        `SELECT * FROM deliveries
         WHERE status = 'delivered'
         AND (recipient_id = ? OR recipient_phone = ?)
         ORDER BY delivered_at DESC`,
      )
      .all(recipientIdentifier, recipientIdentifier) as Array<Record<string, unknown>>;
  }

  /**
   * Handle a reply from a delivery recipient.
   * Classifies the reply and updates delivery status.
   */
  async handleRecipientReply(
    recipientPhone: string,
    recipientName: string,
    text: string,
    familyDb: Database.Database,
  ): Promise<ReplyResult> {
    const pendingDeliveries = this.getPendingForRecipient(familyDb, recipientPhone);
    if (pendingDeliveries.length === 0) {
      return { handled: false, response: null, senderNotification: null, senderPhone: null };
    }

    // Check for opt-out
    const lower = text.toLowerCase().trim();
    if (lower === "parar" || lower === "stop" || lower === "no más" || lower === "no mas") {
      familyDb.transaction(() => {
        familyDb
          .prepare("UPDATE family_contacts SET opted_out = 1, updated_at = CURRENT_TIMESTAMP WHERE phone = ?")
          .run(recipientPhone);

        for (const d of pendingDeliveries) {
          familyDb
            .prepare("UPDATE deliveries SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(d.id as string);
        }
      })();

      log.info(MOD, "recipient opted out", { recipientPhone: recipientPhone.slice(0, 6) + "...", recipientName });

      return {
        handled: true,
        response: lower === "stop"
          ? "Got it, I won't message you again. If you change your mind, let your family know."
          : "Listo, no te escribiré más. Si cambias de opinión, dile a tu familia.",
        senderNotification: null,
        senderPhone: null,
      };
    }

    // Find which delivery this reply matches
    let targetDelivery: Record<string, unknown>;
    if (pendingDeliveries.length === 1) {
      targetDelivery = pendingDeliveries[0];
    } else {
      targetDelivery = await this.matchReplyToDelivery(text, pendingDeliveries);
    }

    // Classify the reply
    const classification = await this.classifyReply(text);
    const sender = await this.users.getUser(targetDelivery.sender_id as string);
    const messageBody = targetDelivery.message_body as string;

    if (classification === "confirmation") {
      familyDb
        .prepare(
          `UPDATE deliveries SET
            status = 'confirmed',
            confirmed_at = CURRENT_TIMESTAMP,
            confirmation_text = ?,
            next_followup_at = NULL,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .run(text, targetDelivery.id as string);

      log.info(MOD, "delivery confirmed", { deliveryId: targetDelivery.id, recipientName });

      return {
        handled: true,
        response: "Anotado. Gracias!",
        senderNotification: sender
          ? (sender.language === "es"
            ? `${recipientName} confirmó: "${messageBody}" — respondió: "${text}"`
            : `${recipientName} confirmed: "${messageBody}" — replied: "${text}"`)
          : null,
        senderPhone: sender?.phone ?? null,
      };
    }

    if (classification === "pushback") {
      familyDb
        .prepare(
          `UPDATE deliveries SET
            confirmation_text = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .run(text, targetDelivery.id as string);

      return {
        handled: true,
        response: "Entendido, le aviso.",
        senderNotification: sender
          ? (sender.language === "es"
            ? `${recipientName} respondió a "${messageBody}": "${text}"`
            : `${recipientName} replied to "${messageBody}": "${text}"`)
          : null,
        senderPhone: sender?.phone ?? null,
      };
    }

    // Unrelated — don't handle
    return { handled: false, response: null, senderNotification: null, senderPhone: null };
  }

  // ── Briefing Stats ──────────────────────────────────────────────────────

  getDeliveryStats(familyDb: Database.Database, userId: string): DeliveryStats {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayStr = yesterday.toISOString();

    const sentYesterday = (
      familyDb
        .prepare("SELECT COUNT(*) as cnt FROM deliveries WHERE sender_id = ? AND created_at >= ?")
        .get(userId, yesterdayStr) as { cnt: number }
    ).cnt;

    const confirmedYesterday = (
      familyDb
        .prepare("SELECT COUNT(*) as cnt FROM deliveries WHERE sender_id = ? AND status = 'confirmed' AND confirmed_at >= ?")
        .get(userId, yesterdayStr) as { cnt: number }
    ).cnt;

    const pendingNow = (
      familyDb
        .prepare("SELECT COUNT(*) as cnt FROM deliveries WHERE sender_id = ? AND status = 'delivered'")
        .get(userId) as { cnt: number }
    ).cnt;

    return { sentYesterday, confirmedYesterday, pendingNow };
  }

  getPendingDeliveryDetails(
    familyDb: Database.Database,
    userId: string,
  ): Array<{ recipientName: string; messageBody: string }> {
    const rows = familyDb
      .prepare(
        `SELECT recipient_name, message_body FROM deliveries
         WHERE sender_id = ? AND status = 'delivered'
         ORDER BY delivered_at DESC LIMIT 5`,
      )
      .all(userId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      recipientName: r.recipient_name as string,
      messageBody: r.message_body as string,
    }));
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private buildSenderConfirmation(
    status: DeliveryStatus,
    isImmediate: boolean,
    recipientName: string,
    deliverAt: Date,
    sender: User,
  ): string {
    if (status === "pending") {
      return sender.language === "es"
        ? `No tengo el WhatsApp de ${recipientName}. Pásame su número y le entrego el mensaje.`
        : `I don't have ${recipientName}'s WhatsApp. Send me their number and I'll deliver the message.`;
    }

    if (isImmediate) {
      return sender.language === "es"
        ? `Listo, le aviso a ${recipientName} ahora mismo.`
        : `Got it, I'll tell ${recipientName} right now.`;
    }

    const timeStr = this.formatTimeInTimezone(deliverAt, sender.timezone, sender.language);
    return sender.language === "es"
      ? `Listo, le aviso a ${recipientName} a las ${timeStr}.`
      : `Got it, I'll tell ${recipientName} at ${timeStr}.`;
  }

  private async composeDeliveryMessage(
    senderName: string,
    recipientName: string,
    messageBody: string,
    language: string,
    isFirstContact: boolean,
  ): Promise<string> {
    // First contact: include intro + opt-out
    if (isFirstContact) {
      const intro = language === "es"
        ? `Hola ${recipientName}! Soy Alma, la asistente del hogar de tu familia.`
        : `Hi ${recipientName}! I'm Alma, your family's home assistant.`;

      const body = language === "es"
        ? `${senderName} me pidió que te avise: ${messageBody}.\n\nAvísame cuando lo hagas. Si prefieres que no te escriba, responde "parar".`
        : `${senderName} asked me to let you know: ${messageBody}.\n\nLet me know when it's done. If you'd rather I don't message you, reply "stop".`;

      return `${intro}\n\n${body}`;
    }

    // Template-based composition (no LLM needed — saves ~$0.002/delivery)
    return language === "es"
      ? `Hola ${recipientName}! ${senderName} me pidió que te avise: ${messageBody}.\n\nAvísame cuando lo hagas.`
      : `Hi ${recipientName}! ${senderName} asked me to let you know: ${messageBody}.\n\nLet me know when it's done.`;
  }

  private async classifyReply(text: string): Promise<"confirmation" | "pushback" | "unrelated"> {
    const lower = text.toLowerCase().trim();

    // Quick pattern match for common responses
    const confirmPatterns = [
      "ok", "okey", "dale", "listo", "ya", "hecho", "ya lo hice", "ya la saqué",
      "ya lo saqué", "done", "got it", "will do", "ya está", "claro", "sí",
      "si", "va", "sale", "bueno", "perfecto",
    ];
    if (confirmPatterns.some((p) => lower === p || lower.startsWith(p + " "))) {
      return "confirmation";
    }

    const pushbackPatterns = [
      "no puedo", "no voy", "después", "despues", "luego", "estoy ocupado",
      "can't", "later", "busy", "not now", "a qué hora", "por qué",
    ];
    if (pushbackPatterns.some((p) => lower.includes(p))) {
      return "pushback";
    }

    // Ambiguous — use LLM
    try {
      const messages: LLMMessage[] = [
        {
          role: "system",
          content: [
            "Classify this reply to a task request. Output ONLY valid JSON:",
            '{"type":"confirmation"} if they agreed or did it',
            '{"type":"pushback"} if they can\'t, won\'t, or are questioning it',
            '{"type":"unrelated"} if not about the task at all',
          ].join("\n"),
        },
        { role: "user", content: text },
      ];

      const response = await this.llm.generate(messages, { temperature: 0, maxTokens: 30, disableThinking: true });
      const parsed = parseLLMJson(
        response.text,
        validateReplyClassification,
        { type: "unrelated" as const },
        MOD,
      );
      return parsed.type;
    } catch (error) {
      log.warn(MOD, "reply classification LLM failed", { error: String(error) });
    }

    return "unrelated";
  }

  private async matchReplyToDelivery(
    text: string,
    deliveries: Array<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    if (deliveries.length <= 1) return deliveries[0];

    try {
      const options = deliveries.map((d, i) => `${i}: "${d.message_body as string}"`).join("\n");
      const messages: LLMMessage[] = [
        {
          role: "system",
          content: [
            "The user replied to one of these pending requests. Which one?",
            "Output ONLY the number (0, 1, 2, etc.).",
            "",
            options,
          ].join("\n"),
        },
        { role: "user", content: text },
      ];

      const response = await this.llm.generate(messages, { temperature: 0, maxTokens: 10, disableThinking: true });
      const idx = parseInt(response.text.trim(), 10);
      if (idx >= 0 && idx < deliveries.length) return deliveries[idx];
    } catch (error) {
      log.warn(MOD, "reply matching LLM failed", { error: String(error) });
    }

    // Default to most recent
    return deliveries[0];
  }

  /**
   * Parse delivery time string into a Date, respecting user's timezone.
   * All returned dates are in UTC for DB storage.
   */
  private parseDeliveryTime(when: string | null, timezone: string): Date | null {
    if (!when) return null;

    // Try HH:MM format
    const timeMatch = when.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const min = parseInt(timeMatch[2], 10);
      if (hour > 23 || min > 59) return null;
      return this.nextOccurrenceOfTime(hour, min, timezone);
    }

    // Try "mañana a las HH:MM" or "mañana a las H"
    const tomorrowMatch = when.match(/ma[nñ]ana.*?(\d{1,2}):?(\d{2})?/i);
    if (tomorrowMatch) {
      const hour = Math.min(23, parseInt(tomorrowMatch[1], 10));
      const min = tomorrowMatch[2] ? Math.min(59, parseInt(tomorrowMatch[2], 10)) : 0;
      return this.timeInTimezoneOnDate(hour, min, timezone, 1); // +1 day
    }

    // Try "en X minutos/horas"
    const relativeMatch = when.match(/en\s+(\d+)\s*(min|hora|hour)/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const ms = unit.startsWith("min") ? amount * 60_000 : amount * 3_600_000;
      return new Date(Date.now() + ms);
    }

    // Try bare hour: "a las 8", "a las 20"
    const bareHourMatch = when.match(/(?:a las?\s+)?(\d{1,2})(?:\s*(?:pm|am))?$/i);
    if (bareHourMatch) {
      let hour = parseInt(bareHourMatch[1], 10);
      if (when.toLowerCase().includes("pm") && hour < 12) hour += 12;
      if (hour > 23) return null;
      return this.nextOccurrenceOfTime(hour, 0, timezone);
    }

    log.warn(MOD, "unparseable delivery time", { when });
    return null; // Unparseable — deliver immediately
  }

  /**
   * Get the next occurrence of a specific time in the user's timezone.
   * If the time has already passed today, returns tomorrow at that time.
   */
  private nextOccurrenceOfTime(hour: number, min: number, timezone: string): Date {
    // Get current time in user's timezone
    const nowInTz = this.nowInTimezone(timezone);

    if (nowInTz.hour < hour || (nowInTz.hour === hour && nowInTz.min < min)) {
      // Today at that time
      return this.timeInTimezoneOnDate(hour, min, timezone, 0);
    }

    // Tomorrow at that time
    return this.timeInTimezoneOnDate(hour, min, timezone, 1);
  }

  /**
   * Create a UTC Date for a specific local time in a timezone, optionally offset by days.
   */
  private timeInTimezoneOnDate(hour: number, min: number, timezone: string, dayOffset: number): Date {
    // Create a date string in the target timezone, then parse to UTC
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() + dayOffset);

    // Format the target date parts in the user's timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(target);

    const year = parts.find((p) => p.type === "year")?.value ?? String(target.getFullYear());
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";

    // Build ISO string with the desired local time, then convert via timezone offset
    const localStr = `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;

    // Use a trick: format current time to get the UTC offset for this timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    });
    const tzParts = formatter.formatToParts(target);
    const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "+00:00";
    // Extract offset like "GMT-05:00" → "-05:00"
    const offsetMatch = tzName.match(/([+-]\d{2}:\d{2})/);
    const offset = offsetMatch ? offsetMatch[1] : "+00:00";

    return new Date(`${localStr}${offset}`);
  }

  private nowInTimezone(timezone: string): { hour: number; min: number } {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return { hour, min };
  }

  private formatTimeInTimezone(date: Date, timezone: string, language: string): string {
    try {
      return date.toLocaleTimeString(language === "es" ? "es" : "en", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return date.toLocaleTimeString(language === "es" ? "es" : "en", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  private markFailed(familyDb: Database.Database, deliveryId: string, reason: string): void {
    familyDb
      .prepare("UPDATE deliveries SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(deliveryId);
    log.warn(MOD, "delivery marked failed", { deliveryId, reason });
  }

  private async notifySenderOfFailure(
    sender: User,
    recipientName: string,
    messageBody: string,
    provider: MessageProvider,
  ): Promise<void> {
    const msg = sender.language === "es"
      ? `No pude entregar tu mensaje a ${recipientName} ("${messageBody.slice(0, 50)}"). Puedes intentar de nuevo.`
      : `Couldn't deliver your message to ${recipientName} ("${messageBody.slice(0, 50)}"). You can try again.`;

    await provider.send({ to: sender.phone, text: msg });
  }

  private getDelivery(familyDb: Database.Database, id: string): Delivery | null {
    const row = familyDb
      .prepare("SELECT * FROM deliveries WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToDelivery(row);
  }

  private rowToDelivery(row: Record<string, unknown>): Delivery {
    return {
      id: row.id as string,
      senderId: row.sender_id as string,
      recipientId: (row.recipient_id as string) ?? null,
      recipientName: row.recipient_name as string,
      recipientPhone: (row.recipient_phone as string) ?? null,
      messageBody: row.message_body as string,
      status: row.status as DeliveryStatus,
      deliverAt: row.deliver_at ? new Date(row.deliver_at as string) : null,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at as string) : null,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
      confirmationText: (row.confirmation_text as string) ?? null,
      followupCount: (row.followup_count as number) ?? 0,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    };
  }

  private isFirstContact(familyDb: Database.Database, phone: string): boolean {
    const contact = familyDb
      .prepare("SELECT first_contacted FROM family_contacts WHERE phone = ?")
      .get(phone) as { first_contacted: number } | undefined;

    return !contact || contact.first_contacted === 0;
  }

  private markFirstContact(familyDb: Database.Database, phone: string): void {
    familyDb
      .prepare("UPDATE family_contacts SET first_contacted = 1, updated_at = CURRENT_TIMESTAMP WHERE phone = ?")
      .run(phone);
  }

  private registerDeliveryPhone(phone: string, familyId: string, contactName: string): void {
    try {
      (this.users as any).masterDb
        .prepare(
          `INSERT OR REPLACE INTO delivery_phones (phone, family_id, contact_name)
           VALUES (?, ?, ?)`,
        )
        .run(phone, familyId, contactName);
    } catch (error) {
      log.error(MOD, "failed to register delivery phone", error);
    }
  }

  private getDefaultCountryCode(user: User): string {
    // Derive from user's phone number
    const phone = user.phone;
    if (phone.startsWith("+593")) return "593";
    if (phone.startsWith("+52")) return "52";
    if (phone.startsWith("+1")) return "1";
    if (phone.startsWith("+57")) return "57";
    return "593"; // Default Ecuador
  }
}
