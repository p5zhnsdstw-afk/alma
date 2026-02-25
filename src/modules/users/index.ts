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

export class UserService {
  constructor(
    private masterDb: Database.Database,
    private config: AlmaConfig,
  ) {}

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

    // Create family
    this.masterDb
      .prepare(
        `INSERT INTO families (id, name, plan, trial_ends_at)
         VALUES (?, 'New Family', 'trial', datetime('now', '+7 days'))`,
      )
      .run(familyId);

    // Create user at step 0
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
  }

  /**
   * Process an onboarding response. Returns the next message to send.
   * Returns null if onboarding is complete (hand off to normal flow).
   */
  async processOnboarding(
    user: User,
    text: string,
    provider: MessageProvider,
  ): Promise<string | null> {
    const step = user.onboardingStep;

    switch (step) {
      case ONBOARDING_STEPS.ASKED_NAME: {
        // User replied with their name
        const name = text.trim().split(/\s+/).slice(0, 3).join(" ");
        this.masterDb
          .prepare("UPDATE users SET name = ?, onboarding_step = ? WHERE id = ?")
          .run(name, ONBOARDING_STEPS.ASKED_TOMORROW, user.id);
        this.masterDb
          .prepare("UPDATE families SET name = ? WHERE id = ?")
          .run(`Familia ${name.split(" ")[0]}`, user.familyId);

        return `Mucho gusto, ${name.split(" ")[0]}! 🏠\n\n¿Tienes algo importante mañana? Cuéntame y lo agendo.`;
      }

      case ONBOARDING_STEPS.ASKED_TOMORROW: {
        // Capture whatever they said (or "no")
        const lower = text.toLowerCase().trim();
        if (lower !== "no" && lower !== "nada" && lower !== "no tengo" && lower.length > 2) {
          // Capture as event in family DB
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
        }

        this.masterDb
          .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_FAMILY, user.id);

        const captured = lower !== "no" && lower !== "nada" && lower !== "no tengo" && lower.length > 2;
        const prefix = captured ? "Listo, agendado. " : "";
        return `${prefix}¿Quiénes viven contigo? Nombres y relación (ej: "Juan, mi esposo" o "solo yo").`;
      }

      case ONBOARDING_STEPS.ASKED_FAMILY: {
        // Store family context as preference
        const familyDb = this.getFamilyDb(user.familyId);
        familyDb
          .prepare(
            `INSERT OR REPLACE INTO preferences (key, value, updated_at)
             VALUES ('family_members_raw', ?, CURRENT_TIMESTAMP)`,
          )
          .run(text.trim());

        this.masterDb
          .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_BRIEFING_TIME, user.id);

        return "¿A qué hora te despiertas normalmente? Tu briefing matutino llegará a esa hora. (ej: 6:30, 7:00)";
      }

      case ONBOARDING_STEPS.ASKED_BRIEFING_TIME: {
        // Parse time
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

        return `Perfecto, tu briefing llegará a las ${briefingTime} cada mañana.\n\n¿Usas Google Calendar, Apple Calendar, o ninguno?`;
      }

      case ONBOARDING_STEPS.ASKED_CALENDAR: {
        const lower = text.toLowerCase().trim();

        if (lower.includes("google")) {
          this.masterDb
            .prepare("UPDATE users SET calendar_provider = 'google', onboarding_step = ? WHERE id = ?")
            .run(ONBOARDING_STEPS.WAITING_CALENDAR_CREDS, user.id);

          // TODO: generate real OAuth URL
          const oauthUrl = "https://alma.app/connect/google?user=" + user.id;
          return `Abre este link para conectar tu Google Calendar:\n${oauthUrl}\n\nCuando termines, dime "listo".`;
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
            "Tu contraseña normal de Apple no cambia. Esta es solo para que Alma lea tu calendario.",
          ].join("\n");
        }

        // No calendar / none / nada
        this.masterDb
          .prepare("UPDATE users SET calendar_provider = NULL, onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_PARTNER, user.id);

        return "Sin problema. Solo cuéntame tus eventos por aquí y yo me encargo de todo.\n\n¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
      }

      case ONBOARDING_STEPS.WAITING_CALENDAR_CREDS: {
        const lower = text.toLowerCase().trim();
        const provider = user.calendarProvider;

        if (provider === "google" && (lower === "listo" || lower === "conectado" || lower === "done")) {
          // OAuth callback should have stored the token. Verify.
          const updated = this.masterDb
            .prepare("SELECT calendar_token FROM users WHERE id = ?")
            .get(user.id) as { calendar_token: string | null } | undefined;

          if (updated?.calendar_token) {
            this.masterDb
              .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
              .run(ONBOARDING_STEPS.ASKED_PARTNER, user.id);
            return "Google Calendar conectado. Tus eventos ya están sincronizados.\n\n¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
          }
          return 'Parece que la conexión no se completó. Intenta el link de nuevo, y cuando termine dime "listo".';
        }

        if (provider === "apple") {
          // Expect "apple_id:app_specific_password" or just the password
          // User might send just the app-specific password
          const creds = text.trim();
          if (creds.length >= 10) {
            // Store credentials (will be validated on first sync)
            // If no apple_id in the creds, we'll need to ask
            const hasAtSign = creds.includes("@");
            if (!hasAtSign) {
              // Need apple ID too
              this.masterDb
                .prepare("UPDATE users SET calendar_token = ? WHERE id = ?")
                .run(creds, user.id); // store password temporarily
              return "Recibí la contraseña. ¿Cuál es tu Apple ID? (el email que usas para iCloud)";
            }

            // Has email — assume format is "email password" or "email:password"
            const parts = creds.includes(":") ? creds.split(":") : creds.split(/\s+/);
            if (parts.length >= 2) {
              const token = `${parts[0].trim()}:${parts.slice(1).join("").trim()}`;
              this.masterDb
                .prepare(
                  "UPDATE users SET calendar_token = ?, onboarding_step = ? WHERE id = ?",
                )
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
              .prepare(
                "UPDATE users SET calendar_token = ?, onboarding_step = ? WHERE id = ?",
              )
              .run(token, ONBOARDING_STEPS.ASKED_PARTNER, user.id);
            return "Apple Calendar conectado. Sincronizando tus eventos...\n\n¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
          }

          return "No logré entender las credenciales. Envíame tu Apple ID (email) y la contraseña de app, separados por un espacio.";
        }

        // Shouldn't reach here — skip to partner
        this.masterDb
          .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
          .run(ONBOARDING_STEPS.ASKED_PARTNER, user.id);
        return "¿Quieres que tu pareja también reciba recordatorios? Si sí, pásame su número.";
      }

      case ONBOARDING_STEPS.ASKED_PARTNER: {
        const lower = text.toLowerCase().trim();
        if (lower === "no" || lower === "no gracias" || lower === "después" || lower === "despues") {
          // Complete inline onboarding
          this.masterDb
            .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
            .run(ONBOARDING_STEPS.COMPLETE, user.id);

          return [
            "¡Listo! Ya estás configurado.",
            "",
            `Tu primer briefing llega mañana a las ${user.briefingTime}.`,
            "",
            "Mientras tanto, puedes decirme cosas como:",
            '• "Mañana tengo cita con el doctor a las 3"',
            '• "Recuérdame comprar leche"',
            '• "¿Qué tengo esta semana?"',
            "",
            "Yo me encargo.",
          ].join("\n");
        }

        // Parse phone number
        const phoneMatch = text.match(/[\d+]{8,15}/);
        if (phoneMatch) {
          const partnerPhone = phoneMatch[0].startsWith("+")
            ? phoneMatch[0]
            : text.includes("+")
              ? "+" + phoneMatch[0]
              : phoneMatch[0];

          // Store for later partner invite
          const familyDb = this.getFamilyDb(user.familyId);
          familyDb
            .prepare(
              `INSERT OR REPLACE INTO preferences (key, value, updated_at)
               VALUES ('pending_partner_phone', ?, CURRENT_TIMESTAMP)`,
            )
            .run(partnerPhone);

          this.masterDb
            .prepare("UPDATE users SET onboarding_step = ? WHERE id = ?")
            .run(ONBOARDING_STEPS.COMPLETE, user.id);

          return [
            `Voy a invitar a tu pareja al ${partnerPhone}. Le haré sus propias preguntas (incluyendo qué calendario usa).`,
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
