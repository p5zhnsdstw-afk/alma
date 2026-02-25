/**
 * Nudge module — proactive reminders to family members.
 * Job Story: "When I'm the person who holds all the family logistics in my head,
 * I want an assistant that proactively nudges each family member about their
 * responsibilities, so I can stop being the family switchboard."
 *
 * NBR-1: Never more than 5 proactive messages/day per user.
 *
 * Also handles:
 * - Calendar connection nudges for WhatsApp-only users (D-19)
 * - Deferred onboarding steps (home type, appliances — Days 3-14)
 * - Partner invitations
 */

import type { LLMService } from "../llm/index.js";
import type { UserService, User } from "../users/index.js";
import type { TaskService } from "../tasks/index.js";
import type { MessageProvider } from "../whatsapp/provider.js";
import type Database from "better-sqlite3";

const MAX_DAILY_NUDGES = 5;

/** Track daily nudge count per user (in-memory, resets at midnight) */
const dailyCounts = new Map<string, { count: number; date: string }>();

function getNudgeCount(userId: string): number {
  const today = new Date().toISOString().split("T")[0];
  const entry = dailyCounts.get(userId);
  if (!entry || entry.date !== today) {
    dailyCounts.set(userId, { count: 0, date: today });
    return 0;
  }
  return entry.count;
}

function incrementNudge(userId: string): boolean {
  const count = getNudgeCount(userId);
  if (count >= MAX_DAILY_NUDGES) return false;

  const today = new Date().toISOString().split("T")[0];
  dailyCounts.set(userId, { count: count + 1, date: today });
  return true;
}

export class NudgeService {
  constructor(
    private llm: LLMService,
    private users: UserService,
    private tasks: TaskService,
  ) {}

  /** Process all pending nudges for a family. Returns count sent. */
  async processNudges(
    familyId: string,
    provider: MessageProvider,
  ): Promise<number> {
    const members = await this.users.getFamilyMembers(familyId);
    let sent = 0;

    for (const member of members) {
      if (member.onboardingStep !== -1) continue; // still onboarding

      // Task nudges — assigned tasks approaching due date
      const familyDb = this.users.getFamilyDb(familyId);
      const dueSoon = familyDb
        .prepare(
          `SELECT * FROM items
           WHERE assigned_to = ? AND status = 'active'
           AND due_at IS NOT NULL
           AND due_at BETWEEN datetime('now') AND datetime('now', '+4 hours')`,
        )
        .all(member.id) as Array<Record<string, unknown>>;

      for (const task of dueSoon) {
        if (!incrementNudge(member.id)) break; // hit daily limit

        await provider.send({
          to: member.phone,
          text: `Heads up — "${task.title as string}" vence pronto.`,
        });
        sent++;
      }
    }

    return sent;
  }

  /**
   * Calendar connection nudge for WhatsApp-only users.
   * Runs once at Day 7 and once at Day 14, then stops.
   * Not pushy — framed as a tip, not a demand.
   */
  async nudgeCalendarConnection(provider: MessageProvider): Promise<number> {
    let sent = 0;

    // Day 7 candidates
    const day7 = this.users.getCalendarNudgeCandidates(7);
    for (const user of day7) {
      if (!this.shouldNudgeCalendar(user, 7)) continue;
      if (!incrementNudge(user.id)) continue;

      const familyDb = this.users.getFamilyDb(user.familyId);
      const eventCount = (
        familyDb
          .prepare("SELECT COUNT(*) as cnt FROM calendar_events WHERE user_id = ?")
          .get(user.id) as { cnt: number }
      ).cnt;

      // Only nudge if they have few events (the sync would clearly help)
      if (eventCount >= 10) continue;

      const msg =
        user.language === "es"
          ? `Tip: si conectas tu Google o Apple Calendar, tus eventos aparecen automáticamente en tu briefing. Dime "conectar calendario" y te explico en 1 minuto.`
          : `Tip: connect your Google or Apple Calendar and your events sync automatically into your briefing. Just say "connect calendar" and I'll walk you through it.`;

      await provider.send({ to: user.phone, text: msg });

      // Mark that we nudged at day 7
      familyDb
        .prepare(
          `INSERT OR REPLACE INTO preferences (key, value, updated_at)
           VALUES ('calendar_nudge_day7', 'sent', CURRENT_TIMESTAMP)`,
        )
        .run();

      sent++;
    }

    // Day 14 candidates — only if day 7 nudge was sent and ignored
    const day14 = this.users.getCalendarNudgeCandidates(14);
    for (const user of day14) {
      if (!this.shouldNudgeCalendar(user, 14)) continue;
      if (!incrementNudge(user.id)) continue;

      const familyDb = this.users.getFamilyDb(user.familyId);

      // Check day 7 was sent
      const day7Sent = familyDb
        .prepare("SELECT value FROM preferences WHERE key = 'calendar_nudge_day7'")
        .get() as { value: string } | undefined;

      if (!day7Sent) continue;

      // Check day 14 not already sent
      const day14Sent = familyDb
        .prepare("SELECT value FROM preferences WHERE key = 'calendar_nudge_day14'")
        .get() as { value: string } | undefined;

      if (day14Sent) continue;

      const msg =
        user.language === "es"
          ? `Vi que aún no has conectado tu calendario. Con la conexión, cada evento nuevo que crees en Google/Apple aparece en tu briefing automáticamente — sin tener que decírmelo. ¿Quieres conectar?`
          : `I noticed you haven't connected your calendar yet. With sync, every new event you add shows up in your briefing automatically — no need to tell me. Want to connect?`;

      await provider.send({ to: user.phone, text: msg });

      familyDb
        .prepare(
          `INSERT OR REPLACE INTO preferences (key, value, updated_at)
           VALUES ('calendar_nudge_day14', 'sent', CURRENT_TIMESTAMP)`,
        )
        .run();

      sent++;
    }

    // After day 14, stop nudging. User made their choice. Respect it.
    return sent;
  }

  /**
   * Deferred onboarding nudges — home type (Day 3-5), appliances (Day 7-10).
   * These are scheduled steps that happen after the initial onboarding conversation.
   */
  async processDeferredOnboarding(provider: MessageProvider): Promise<number> {
    let sent = 0;

    // Day 3: Ask about home type
    const day3 = this.getDeferredOnboardingCandidates(3, 8); // step 8 = ASKED_HOME_TYPE
    for (const user of day3) {
      if (!incrementNudge(user.id)) continue;

      this.users
        ["masterDb"] // access private for update
        .prepare("UPDATE users SET onboarding_step = 8 WHERE id = ?")
        .run(user.id);

      const msg =
        user.language === "es"
          ? `Hola ${user.name.split(" ")[0]}! Para darte mejores recomendaciones de mantenimiento: ¿vives en casa o departamento? ¿Más o menos de qué año es?`
          : `Hi ${user.name.split(" ")[0]}! To give you better maintenance tips: do you live in a house or apartment? Roughly what year was it built?`;

      await provider.send({ to: user.phone, text: msg });
      sent++;
    }

    // Day 7: Ask about appliances
    const day7 = this.getDeferredOnboardingCandidates(7, 9); // step 9 = ASKED_APPLIANCES
    for (const user of day7) {
      // Only if they already answered home type (step 8 → -1 or waiting)
      if (!incrementNudge(user.id)) continue;

      const msg =
        user.language === "es"
          ? `¿Qué equipos principales tiene tu casa? Por ejemplo: aire acondicionado, calentador de agua, lavadora, secadora. Dime lo que tengas y busco sus calendarios de mantenimiento.`
          : `What major appliances/systems does your home have? AC, water heater, washer, dryer — tell me what you've got and I'll set up maintenance schedules.`;

      await provider.send({ to: user.phone, text: msg });
      sent++;
    }

    return sent;
  }

  private shouldNudgeCalendar(user: User, day: number): boolean {
    // Don't nudge if already connected
    if (user.calendarProvider) return false;
    // Don't nudge if still onboarding
    if (user.onboardingStep !== -1) return false;
    return true;
  }

  private getDeferredOnboardingCandidates(
    minDays: number,
    targetStep: number,
  ): User[] {
    // Find users who completed initial onboarding N+ days ago
    // and haven't been asked this deferred step yet
    const rows = (this.users as any).masterDb
      .prepare(
        `SELECT * FROM users
         WHERE onboarding_step = -1
         AND created_at <= datetime('now', '-' || ? || ' days')`,
      )
      .all(minDays) as Array<Record<string, unknown>>;

    return rows
      .map((r) => ({
        id: r.id as string,
        familyId: r.family_id as string,
        phone: r.phone as string,
        name: r.name as string,
        role: r.role as User["role"],
        language: r.language as string,
        timezone: r.timezone as string,
        briefingTime: r.briefing_time as string,
        onboardingStep: r.onboarding_step as number,
        calendarProvider: (r.calendar_provider as string) ?? null,
        calendarExternalId: (r.calendar_external_id as string) ?? null,
        calendarToken: (r.calendar_token as string) ?? null,
      }))
      .filter((u) => {
        // Check if this deferred step was already asked
        const familyDb = this.users.getFamilyDb(u.familyId);
        const asked = familyDb
          .prepare(`SELECT value FROM preferences WHERE key = ?`)
          .get(`deferred_step_${targetStep}`) as { value: string } | undefined;
        return !asked;
      });
  }
}
