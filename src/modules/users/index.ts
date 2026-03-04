/**
 * Users module — multi-tenant family management + onboarding state machine.
 * D-10: Per-family SQLite files for household data.
 * D-6: Progressive onboarding, conversational, over 2 weeks.
 * D-20: Per-member calendar adapter.
 */

import type Database from "better-sqlite3";
import type { MessageProvider } from "../whatsapp/provider.js";
import { getFamilyDb } from "../../db/family.js";
import type { AlmaConfig } from "../../config.js";
import type { LLMService } from "../llm/index.js";
import { log } from "../../utils/logger.js";
import { parseLLMJson, validateFamilyContacts } from "../../utils/llm-parse.js";
import { parsePhone } from "../../utils/phone.js";

const MOD = "users";

/**
 * Onboarding steps (stored as integer in DB):
 *  0  = not started (just messaged for the first time)
 *  1  = asked name
 *  2  = asked "anything important tomorrow?"
 *  3  = asked family members
 *  4  = asked briefing time
 *  5  = asked calendar provider
 *  6  = waiting for calendar credentials (Google OAuth callback or Apple app password)
 *  7  = asked partner invite
 *  8  = asked home type (Day 3-5, triggered by cron, not inline)
 *  9  = asked appliances (Day 7-10, triggered by cron)
 *  10 = asked full home profile review (Day 14, triggered by cron)
 *  -1 = complete
 *
 * Steps 1-7 happen inline during first conversation (15 min).
 * Steps 8-10 are triggered by scheduled nudges on the right day.
 */
export const ONBOARDING_STEPS = {
  NOT_STARTED: 0,
  ASKED_NAME: 1,
  ASKED_TOMORROW: 2,
  ASKED_FAMILY: 3,
  ASKED_BRIEFING_TIME: 4,
  ASKED_CALENDAR: 5,
  WAITING_CALENDAR_CREDS: 6,
  ASKED_PARTNER: 7,
  ASKED_HOME_TYPE: 8,
  ASKED_APPLIANCES: 9,
  ASKED_HOME_REVIEW: 10,
  COMPLETE: -1,
} as const;

export interface User {
  id: string;
  familyId: string;
  phone: string;
  name: string;
  role: "primary" | "partner" | "member";
  language: string;
  timezone: string;
  briefingTime: string;
  onboardingStep: number;
  calendarProvider: string | null;
  calendarExternalId: string | null;
  calendarToken: string | null;
}

interface CalendarHelpers {
  getGoogleAuthUrl: (userId: string) => string;
}

export class UserService {
  private llm?: LLMService;
  private calendarHelpers?: CalendarHelpers;

  constructor(
    private masterDb: Database.Database,
    private config: AlmaConfig,
  ) {}

  /** Late-bind LLM to avoid circular dependency at init time */
  setLLM(llm: LLMService): void {
    this.llm = llm;
  }

  /** Late-bind calendar helpers for OAuth URL generation */
  setCalendarHelpers(helpers: CalendarHelpers): void {
    this.calendarHelpers = helpers;
  }

  /** Store calendar token after OAuth exchange */
  storeCalendarToken(userId: string, token: string, externalId: string): void {
    this.masterDb
      .prepare("UPDATE users SET calendar_token = ?, calendar_external_id = ?, onboarding_step = ? WHERE id = ?")
      .run(token, externalId, ONBOARDING_STEPS.ASKED_PARTNER, userId);
  }

  /** Resolve a phone number to a user, or null if not registered */
  async resolveUser(phone: string): Promise<User | null> {
    const row = this.masterDb
      .prepare("SELECT * FROM users WHERE phone = ?")
      .get(phone) as Record<string, unknown> | undefined;

    if (!row) return null;
    return rowToUser(row);
  }

  /** Get user by ID */
  async getUser(userId: string): Promise<User | null> {
    const row = this.masterDb
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return rowToUser(row);
  }

  /** Get the per-family SQLite database for a family */
  getFamilyDb(familyId: string): Database.Database {
    return getFamilyDb(this.config.dataDir, familyId);
  }

  /** Start onboarding flow for a new user (D-6: progressive, conversational) */
  async startOnboarding(phone: string, provider: MessageProvider): Promise<void> {
    const familyId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    try {
      // Create family
      this.masterDb
        .prepare(
          `INSERT INTO families (id, name, plan, trial_ends_at)
           VALUES (?, 'New Family', 'trial', datetime('now', '+7 days'))`,
        )
        .run(familyId);

      // Create user at step 1 (ASKED_NAME)
      this.masterDb
        .prepare(
          `INSERT INTO users (id, family_id, phone, name, role, onboarding_step)
           VALUES (?, ?, ?, '', 'primary', ?)`,
        )
        .run(userId, familyId, phone, ONBOARDING_STEPS.ASKED_NAME);

      // Initialize family database
      this.getFamilyDb(familyId);

      await provider.send({
        to: phone,
        text: "Hola! Soy Alma, tu asistente de hogar y vida. Vamos a conocernos en unos minutos para que mañana tengas tu primer briefing.\n\n¿Cómo te llamas?",
      });

      log.info(MOD, "onboarding started", { userId, familyId, phone: phone.slice(0, 6) + "..." });
    } catch (error) {
      log.error(MOD, "startOnboarding failed", error, { phone: phone.slice(0, 6) + "..." });
      throw error;
    }
  }

  /**
   * Process an onboarding response. Returns the next message to send.
   * Returns null if onboarding is complete (hand off to normal flow).
   *
   * Supports "skip"/"saltar" at any step to advance.
   */
  async processOnboarding(
    user: User,
    text: string,
    provider: MessageProvider,
  ): Promise<string | null> {
    const step = user.onboardingStep;
    const lower = text.toLowerCase().trim();

    // Global escape: skip any step
    if (lower === "skip" || lower === "saltar") {
      return this.skipOnboardingStep(user);
    }

    switch (step) {
      case ONBOARDING_STEPS.ASKED_NAME: {
        const name = text.trim().split(/\s+/).slice(0, 3).join(" ");
        if (!name || name.length < 2) {
          return "No entendí tu nombre. ¿Puedes escribirlo de nuevo?";
        }

        this.masterDb
          .prepare("UPDATE users SET name = ?, onboarding_step = ? WHERE id = ?")
          .run(name, ONBOARDING_STEPS.ASKED_TOMORROW, user.id);
        this.masterDb
          .prepare("UPDATE families SET name = ? WHERE id = ?")
          .run(`Familia ${name.split(" ")[0]}`, user.familyId);

        return `Mucho gusto, ${name.split(" ")[0]}!\n\n¿Tienes algo importante mañana? Cuéntame y lo agendo.`;
      }

      case ONBOARDING_STEPS.ASKED_TOMORROW: {
        if (lower !== "no" && lower !== "nada" && lower !== "no tengo" && lower.length > 2) {
          try {
            const familyDb = this.getFamilyDb(user.familyId);
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);

            familyDb
              .prepare(
                `INSERT INTO calendar_events (id, user_id, title, start_at, status)
                 VALUES (?, ?, ?, ?, 'confirmed')`,
              )
              .run(crypto.randomUUID(), user.id, text.trim(), tomorrow.toISOString());
          } catch (error) {
            log.error(MOD, "failed to capture tomorrow event", error);
          }
        }

        this.masterDb
          .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_FAMILY, user.id);

        const captured = lower !== "no" && lower !== "nada" && lower !== "no tengo" && lower.length > 2;
        const prefix = captured ? "Listo, agendado. " : "";
        return `${prefix}¿Quiénes viven contigo? Nombres y relación (ej: "Juan, mi esposo" o "solo yo").`;
      }

      case ONBOARDING_STEPS.ASKED_FAMILY: {
        const familyDb = this.getFamilyDb(user.familyId);
        familyDb
          .prepare(
            `INSERT OR REPLACE INTO preferences (key, value, updated_at)
             VALUES ('family_members_raw', ?, CURRENT_TIMESTAMP)`,
          )
          .run(text.trim());

        // Parse family members (awaited, with retry)
        await this.parseFamilyContacts(text.trim(), familyDb);

        this.masterDb
          .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_BRIEFING_TIME, user.id);

        return "¿A qué hora te despiertas normalmente? Tu briefing matutino llegará a esa hora. (ej: 6:30, 7:00)";
      }

      case ONBOARDING_STEPS.ASKED_BRIEFING_TIME: {
        const timeMatch = text.match(/(\d{1,2})[:\.]?(\d{2})?/);
        let hour = 6;
        let min = 30;
        if (timeMatch) {
          hour = Math.min(23, Math.max(0, parseInt(timeMatch[1], 10)));
          min = timeMatch[2] ? Math.min(59, parseInt(timeMatch[2], 10)) : 0;
        }
        const briefingTime = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

        this.masterDb
          .prepare("UPDATE users SET briefing_time = ?, onboarding_step = ? WHERE id = ?")
          .run(briefingTime, ONBOARDING_STEPS.ASKED_CALENDAR, user.id);

        return `Perfecto, tu briefing llegará a las ${briefingTime} cada mañana.\n\n¿Usas Google Calendar, Apple Calendar, o ninguno? (puedes decir "saltar" si no quieres conectar ahora)`;
      }

      case ONBOARDING_STEPS.ASKED_CALENDAR: {
        if (lower.includes("google")) {
          this.masterDb
            .prepare("UPDATE users SET calendar_provider = 'google', onboarding_step = ? WHERE id = ?")
            .run(ONBOARDING_STEPS.WAITING_CALENDAR_CREDS, user.id);

          if (!this.calendarHelpers) {
            log.warn("users", "Calendar helpers not bound — cannot generate OAuth URL");
            return "No puedo conectar Google Calendar ahora. Dime \"saltar\" para continuar.";
          }
          const oauthUrl = this.calendarHelpers.getGoogleAuthUrl(user.id);
          return `Abre este link para conectar tu Google Calendar:\n${oauthUrl}\n\nCuando termines, dime "listo". O dime "saltar" para hacerlo después.`;
        }

        if (lower.includes("apple") || lower.includes("icloud") || lower.includes("iphone")) {
          this.masterDb
            .prepare("UPDATE users SET calendar_provider = 'apple', onboarding_step = ? WHERE id = ?")
            .run(ONBOARDING_STEPS.WAITING_CALENDAR_CREDS, user.id);

          return [
            "Para conectar tu Apple Calendar necesito una contraseña de app. Son 3 pasos:",
            "",
            "1. Entra a appleid.apple.com",
            '2. Ve a "Iniciar sesión y seguridad" → "Contraseñas de apps"',
            '3. Crea una con nombre "Alma" y envíamela aquí.',
            "",
            'Tu contraseña normal de Apple no cambia. O dime "saltar" para hacerlo después.',
          ].join("\n");
        }

        // No calendar / none / nada / skip
        this.masterDb
          .prepare("UPDATE users SET calendar_provider = NULL, onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_PARTNER, user.id);

        return "Sin problema. Solo cuéntame tus eventos por aquí y yo me encargo de todo.\n\n¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número. O dime \"no\" o \"después\".";
      }

      case ONBOARDING_STEPS.WAITING_CALENDAR_CREDS: {
        return this.processCalendarCreds(user, text);
      }

      case ONBOARDING_STEPS.ASKED_PARTNER: {
        if (lower === "no" || lower === "no gracias" || lower === "después" || lower === "despues") {
          return this.completeOnboarding(user);
        }

        // Parse phone number with E.164 validation
        const phone = parsePhone(text, this.getDefaultCountryCode(user));
        if (phone) {
          const familyDb = this.getFamilyDb(user.familyId);
          familyDb
            .prepare(
              `INSERT OR REPLACE INTO preferences (key, value, updated_at)
               VALUES ('pending_partner_phone', ?, CURRENT_TIMESTAMP)`,
            )
            .run(phone);

          this.masterDb
            .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
            .run(ONBOARDING_STEPS.COMPLETE, user.id);

          return [
            `Voy a invitar a tu pareja al ${phone}. Le haré sus propias preguntas (incluyendo qué calendario usa).`,
            "",
            `Tu primer briefing llega mañana a las ${user.briefingTime}.`,
            "",
            "Mientras tanto, cuéntame cualquier cosa que quieras agendar. Yo me encargo.",
          ].join("\n");
        }

        return 'Pásame el número con código de país (ej: +593999123456), o dime "no" si prefieres hacerlo después.';
      }

      default:
        // Steps 8-10 are handled by scheduled nudges, not inline
        return null;
    }
  }

  /** Create a partner/member user in an existing family */
  async invitePartner(
    familyId: string,
    phone: string,
    provider: MessageProvider,
  ): Promise<void> {
    const userId = crypto.randomUUID();

    this.masterDb
      .prepare(
        `INSERT INTO users (id, family_id, phone, name, role, onboarding_step)
         VALUES (?, ?, ?, '', 'partner', ?)`,
      )
      .run(userId, familyId, phone, ONBOARDING_STEPS.ASKED_NAME);

    const family = this.masterDb
      .prepare("SELECT name FROM families WHERE id = ?")
      .get(familyId) as { name: string } | undefined;

    await provider.send({
      to: phone,
      text: `Hola! Soy Alma, el asistente de hogar de ${family?.name ?? "tu familia"}. Tu pareja me invitó para que también recibas briefings y recordatorios.\n\n¿Cómo te llamas?`,
    });
  }

  /** Get all users in a family */
  async getFamilyMembers(familyId: string): Promise<User[]> {
    const rows = this.masterDb
      .prepare("SELECT * FROM users WHERE family_id = ?")
      .all(familyId) as Array<Record<string, unknown>>;

    return rows.map(rowToUser);
  }

  /** Resolve a family contact by name (fuzzy match on normalized name) */
  resolveContactByName(
    familyDb: Database.Database,
    name: string,
  ): { id: string; name: string; phone: string | null; userId: string | null; optedOut: boolean } | null {
    const normalized = normalizeName(name);
    const row = familyDb
      .prepare("SELECT * FROM family_contacts WHERE name_normalized = ?")
      .get(normalized) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      id: row.id as string,
      name: row.name as string,
      phone: (row.phone as string) ?? null,
      userId: (row.user_id as string) ?? null,
      optedOut: (row.opted_out as number) === 1,
    };
  }

  /** Add or update a family contact */
  upsertContact(
    familyDb: Database.Database,
    contact: { name: string; phone?: string; userId?: string; relationship?: string },
  ): string {
    const normalized = normalizeName(contact.name);
    const existing = familyDb
      .prepare("SELECT id FROM family_contacts WHERE name_normalized = ?")
      .get(normalized) as { id: string } | undefined;

    if (existing) {
      if (contact.phone) {
        familyDb
          .prepare("UPDATE family_contacts SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(contact.phone, existing.id);
      }
      if (contact.userId) {
        familyDb
          .prepare("UPDATE family_contacts SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(contact.userId, existing.id);
      }
      return existing.id;
    }

    const id = crypto.randomUUID();
    familyDb
      .prepare(
        `INSERT INTO family_contacts (id, name, name_normalized, phone, user_id, relationship)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, contact.name, normalized, contact.phone ?? null, contact.userId ?? null, contact.relationship ?? null);
    return id;
  }

  /** Get all users without calendar sync who completed onboarding N+ days ago */
  getCalendarNudgeCandidates(minDaysOnboarded: number): User[] {
    const rows = this.masterDb
      .prepare(
        `SELECT * FROM users
         WHERE calendar_provider IS NULL
         AND onboarding_step = -1
         AND created_at <= datetime('now', '-' || ? || ' days')`,
      )
      .all(minDaysOnboarded) as Array<Record<string, unknown>>;

    return rows.map(rowToUser);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /** Parse raw family member text into family_contacts via LLM (with retry) */
  private async parseFamilyContacts(rawText: string, familyDb: Database.Database): Promise<void> {
    if (!this.llm) {
      log.warn(MOD, "LLM not bound — skipping family contact parsing");
      return;
    }

    const lower = rawText.toLowerCase().trim();
    if (lower === "solo yo" || lower === "nadie" || lower === "vivo solo" || lower === "just me") return;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.llm.generate([
          {
            role: "system",
            content: [
              "Extract family members from this text. Output ONLY a JSON array.",
              'Each element: {"name":"Pedro","relationship":"hijo"}',
              "If no clear members, output: []",
              "Relationship options: esposo/esposa, hijo/hija, suegra/suegro, hermano/hermana, otro",
            ].join("\n"),
          },
          { role: "user", content: rawText },
        ]);

        const members = parseLLMJson(
          response.text,
          validateFamilyContacts,
          null,
          MOD,
        );

        if (!members) {
          log.warn(MOD, "parseFamilyContacts returned no valid members", { rawText });
          return;
        }

        for (const member of members) {
          this.upsertContact(familyDb, {
            name: member.name,
            relationship: member.relationship,
          });
        }

        log.info(MOD, "family contacts parsed", { count: members.length });
        return;
      } catch (error) {
        if (attempt === 0) {
          log.warn(MOD, "parseFamilyContacts attempt 1 failed, retrying", { error: String(error) });
        } else {
          log.error(MOD, "parseFamilyContacts failed after retry", error);
        }
      }
    }
  }

  private processCalendarCreds(user: User, text: string): string {
    const lower = text.toLowerCase().trim();
    const calendarProvider = user.calendarProvider;

    if (calendarProvider === "google" && (lower === "listo" || lower === "conectado" || lower === "done")) {
      const updated = this.masterDb
        .prepare("SELECT calendar_token FROM users WHERE id = ?")
        .get(user.id) as { calendar_token: string | null } | undefined;

      if (updated?.calendar_token) {
        this.masterDb
          .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_PARTNER, user.id);
        return "Google Calendar conectado. Tus eventos ya están sincronizados.\n\n¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
      }
      return 'Parece que la conexión no se completó. Intenta el link de nuevo, y cuando termine dime "listo". O dime "saltar" para hacerlo después.';
    }

    if (calendarProvider === "apple") {
      const creds = text.trim();
      if (creds.length >= 10) {
        const hasAtSign = creds.includes("@");
        if (!hasAtSign) {
          this.masterDb
            .prepare("UPDATE users SET calendar_token = ? WHERE id = ?")
            .run(creds, user.id);
          return "Recibí la contraseña. ¿Cuál es tu Apple ID? (el email que usas para iCloud)";
        }

        const parts = creds.includes(":") ? creds.split(":") : creds.split(/\s+/);
        if (parts.length >= 2) {
          const token = `${parts[0].trim()}:${parts.slice(1).join("").trim()}`;
          this.masterDb
            .prepare("UPDATE users SET calendar_token = ?, onboarding_step = ? WHERE id = ?")
            .run(token, ONBOARDING_STEPS.ASKED_PARTNER, user.id);
          return "Apple Calendar conectado. Sincronizando tus eventos...\n\n¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
        }
      }

      // Check if this is the apple ID response (we already have the password)
      const storedPassword = (
        this.masterDb
          .prepare("SELECT calendar_token FROM users WHERE id = ?")
          .get(user.id) as { calendar_token: string | null } | undefined
      )?.calendar_token;

      if (storedPassword && text.includes("@")) {
        const token = `${text.trim()}:${storedPassword}`;
        this.masterDb
          .prepare("UPDATE users SET calendar_token = ?, onboarding_step = ? WHERE id = ?")
          .run(token, ONBOARDING_STEPS.ASKED_PARTNER, user.id);
        return "Apple Calendar conectado. Sincronizando tus eventos...\n\n¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
      }

      return 'No logré entender las credenciales. Envíame tu Apple ID (email) y la contraseña de app separados por un espacio. O dime "saltar".';
    }

    // Unknown state — skip to partner
    this.masterDb
      .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
      .run(ONBOARDING_STEPS.ASKED_PARTNER, user.id);
    return "¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
  }

  private skipOnboardingStep(user: User): string {
    const step = user.onboardingStep;

    // Map current step to next step on skip
    const skipMap: Record<number, number> = {
      [ONBOARDING_STEPS.ASKED_NAME]: ONBOARDING_STEPS.ASKED_TOMORROW,
      [ONBOARDING_STEPS.ASKED_TOMORROW]: ONBOARDING_STEPS.ASKED_FAMILY,
      [ONBOARDING_STEPS.ASKED_FAMILY]: ONBOARDING_STEPS.ASKED_BRIEFING_TIME,
      [ONBOARDING_STEPS.ASKED_BRIEFING_TIME]: ONBOARDING_STEPS.ASKED_CALENDAR,
      [ONBOARDING_STEPS.ASKED_CALENDAR]: ONBOARDING_STEPS.ASKED_PARTNER,
      [ONBOARDING_STEPS.WAITING_CALENDAR_CREDS]: ONBOARDING_STEPS.ASKED_PARTNER,
      [ONBOARDING_STEPS.ASKED_PARTNER]: ONBOARDING_STEPS.COMPLETE,
    };

    const nextStep = skipMap[step];
    if (nextStep === undefined) {
      return this.completeOnboarding(user);
    }

    // For name skip, set a placeholder
    if (step === ONBOARDING_STEPS.ASKED_NAME) {
      this.masterDb
        .prepare("UPDATE users SET name = 'User', onboarding_step = ? WHERE id = ?")
        .run(nextStep, user.id);
      return "¿Tienes algo importante mañana? Cuéntame y lo agendo. (o \"saltar\")";
    }

    this.masterDb
      .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
      .run(nextStep, user.id);

    if (nextStep === ONBOARDING_STEPS.COMPLETE) {
      return this.completeOnboarding(user);
    }

    // Return the prompt for the next step
    const prompts: Record<number, string> = {
      [ONBOARDING_STEPS.ASKED_TOMORROW]: "¿Tienes algo importante mañana? Cuéntame y lo agendo.",
      [ONBOARDING_STEPS.ASKED_FAMILY]: '¿Quiénes viven contigo? Nombres y relación (ej: "Juan, mi esposo").',
      [ONBOARDING_STEPS.ASKED_BRIEFING_TIME]: "¿A qué hora te despiertas? Tu briefing llegará a esa hora. (ej: 6:30, 7:00)",
      [ONBOARDING_STEPS.ASKED_CALENDAR]: "¿Usas Google Calendar, Apple Calendar, o ninguno?",
      [ONBOARDING_STEPS.ASKED_PARTNER]: "¿Quieres que tu pareja también reciba recordatorios? Pásame su número o dime \"no\".",
    };

    return prompts[nextStep] ?? this.completeOnboarding(user);
  }

  private completeOnboarding(user: User): string {
    this.masterDb
      .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
      .run(ONBOARDING_STEPS.COMPLETE, user.id);

    const briefingTime = user.briefingTime || "06:30";

    return [
      "¡Listo! Ya estás configurado.",
      "",
      `Tu primer briefing llega mañana a las ${briefingTime}.`,
      "",
      "Mientras tanto, puedes decirme cosas como:",
      '• "Dile a Pedro que saque la basura a las 8pm"',
      '• "Mañana tengo cita con el doctor a las 3"',
      '• "Recuérdame comprar leche"',
      "",
      "Yo me encargo.",
    ].join("\n");
  }

  private getDefaultCountryCode(user: User): string {
    const phone = user.phone;
    if (phone.startsWith("+593")) return "593";
    if (phone.startsWith("+52")) return "52";
    if (phone.startsWith("+1")) return "1";
    if (phone.startsWith("+57")) return "57";
    return "593";
  }
}

/** Normalize a name for matching: lowercase, strip accents */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    familyId: row.family_id as string,
    phone: row.phone as string,
    name: row.name as string,
    role: row.role as User["role"],
    language: row.language as string,
    timezone: row.timezone as string,
    briefingTime: row.briefing_time as string,
    onboardingStep: row.onboarding_step as number,
    calendarProvider: (row.calendar_provider as string) ?? null,
    calendarExternalId: (row.calendar_external_id as string) ?? null,
    calendarToken: (row.calendar_token as string) ?? null,
  };
}
