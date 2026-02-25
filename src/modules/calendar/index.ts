/**
 * Calendar module — Alma's internal calendar is source of truth.
 *
 * Architecture:
 *   Internal calendar (family SQLite) ← sync adapters → External calendars
 *
 * D-14: Google Calendar sync is MVP (champion buyer's #1 feature).
 * D-19: WhatsApp-only mode is first-class fallback (no sync = still works).
 * D-20: Per-member calendar adapter (mixed households supported).
 *
 * Scenarios:
 *   A) Both Google        → Google adapter for both. Easiest.
 *   B) Both Apple         → Apple adapter for both. Post-MVP.
 *   C) Mixed (G + Apple)  → Google for one, Apple for other. Alma unifies.
 *   D) No calendar habit  → WhatsApp-only. Alma IS the calendar.
 *   E) Outlook/Work       → ICS subscription (read-only). Later.
 */

import type { AlmaConfig } from "../../config.js";
import type Database from "better-sqlite3";
import { GoogleCalendarAdapter } from "./adapters/google.js";
import { AppleCalendarAdapter } from "./adapters/apple.js";
import type { CalendarAdapter } from "./adapters/adapter.js";

export interface CalendarEvent {
  id: string;
  externalId: string | null;
  externalSource: string | null;
  userId: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  location: string | null;
  recurrence: string | null;
  status: "confirmed" | "tentative" | "cancelled";
}

export class CalendarService {
  private adapters: Map<string, CalendarAdapter> = new Map();

  constructor(private config: AlmaConfig) {
    // Both adapters are MVP — mixed households are the most common scenario
    this.adapters.set("google", new GoogleCalendarAdapter(config));
    this.adapters.set("apple", new AppleCalendarAdapter(config));
  }

  /** Get today's events for a user from internal calendar */
  getTodayEvents(familyDb: Database.Database, userId: string): CalendarEvent[] {
    const rows = familyDb
      .prepare(
        `SELECT * FROM calendar_events
         WHERE user_id = ? AND status != 'cancelled'
         AND date(start_at) = date('now', 'localtime')
         ORDER BY start_at ASC`,
      )
      .all(userId) as Array<Record<string, unknown>>;

    return rows.map(rowToEvent);
  }

  /** Get events for next N days */
  getUpcoming(familyDb: Database.Database, userId: string, days: number): CalendarEvent[] {
    const rows = familyDb
      .prepare(
        `SELECT * FROM calendar_events
         WHERE user_id = ? AND status != 'cancelled'
         AND start_at BETWEEN datetime('now', 'localtime')
             AND datetime('now', 'localtime', '+' || ? || ' days')
         ORDER BY start_at ASC`,
      )
      .all(userId, days) as Array<Record<string, unknown>>;

    return rows.map(rowToEvent);
  }

  /** Get ALL family events for today (for morning briefing) */
  getFamilyToday(familyDb: Database.Database): CalendarEvent[] {
    const rows = familyDb
      .prepare(
        `SELECT * FROM calendar_events
         WHERE status != 'cancelled'
         AND date(start_at) = date('now', 'localtime')
         ORDER BY start_at ASC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(rowToEvent);
  }

  /** Create an event in Alma's internal calendar */
  createEvent(
    familyDb: Database.Database,
    event: Omit<CalendarEvent, "id" | "externalId" | "externalSource" | "status">,
  ): string {
    const id = crypto.randomUUID();
    familyDb
      .prepare(
        `INSERT INTO calendar_events (id, user_id, title, description, start_at, end_at, all_day, location, recurrence, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
      )
      .run(
        id,
        event.userId,
        event.title,
        event.description,
        event.startAt.toISOString(),
        event.endAt?.toISOString() ?? null,
        event.allDay ? 1 : 0,
        event.location,
        event.recurrence,
      );

    return id;
  }

  /** Sync a user's external calendar into Alma's internal calendar */
  async syncUser(
    familyDb: Database.Database,
    user: { id: string; calendarProvider: string | null; calendarExternalId: string | null; calendarToken: string | null },
  ): Promise<{ added: number; updated: number; removed: number }> {
    if (!user.calendarProvider || !user.calendarToken) {
      return { added: 0, updated: 0, removed: 0 };
    }

    const adapter = this.adapters.get(user.calendarProvider);
    if (!adapter) {
      return { added: 0, updated: 0, removed: 0 };
    }

    // Pull events from external calendar
    const externalEvents = await adapter.fetchEvents(
      user.calendarExternalId!,
      user.calendarToken,
    );

    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const ext of externalEvents) {
      const existing = familyDb
        .prepare(
          "SELECT id FROM calendar_events WHERE external_id = ? AND external_source = ?",
        )
        .get(ext.externalId, user.calendarProvider) as { id: string } | undefined;

      if (existing) {
        // Update existing
        familyDb
          .prepare(
            `UPDATE calendar_events SET title = ?, description = ?, start_at = ?, end_at = ?,
             all_day = ?, location = ?, status = ?, synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .run(
            ext.title,
            ext.description,
            ext.startAt.toISOString(),
            ext.endAt?.toISOString() ?? null,
            ext.allDay ? 1 : 0,
            ext.location,
            ext.status,
            existing.id,
          );
        updated++;
      } else {
        // Insert new
        familyDb
          .prepare(
            `INSERT INTO calendar_events (id, external_id, external_source, user_id, title, description,
             start_at, end_at, all_day, location, status, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          )
          .run(
            crypto.randomUUID(),
            ext.externalId,
            user.calendarProvider,
            user.id,
            ext.title,
            ext.description,
            ext.startAt.toISOString(),
            ext.endAt?.toISOString() ?? null,
            ext.allDay ? 1 : 0,
            ext.location,
            ext.status,
          );
        added++;
      }
    }

    // Push Alma-created events back to external calendar
    const almaOnly = familyDb
      .prepare(
        "SELECT * FROM calendar_events WHERE user_id = ? AND external_id IS NULL AND status = 'confirmed'",
      )
      .all(user.id) as Array<Record<string, unknown>>;

    for (const row of almaOnly) {
      const event = rowToEvent(row);
      const externalId = await adapter.createEvent(
        user.calendarExternalId!,
        user.calendarToken,
        event,
      );
      if (externalId) {
        familyDb
          .prepare(
            "UPDATE calendar_events SET external_id = ?, external_source = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
          .run(externalId, user.calendarProvider, event.id);
      }
    }

    return { added, updated, removed };
  }
}

function rowToEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    externalId: (row.external_id as string) ?? null,
    externalSource: (row.external_source as string) ?? null,
    userId: row.user_id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    startAt: new Date(row.start_at as string),
    endAt: row.end_at ? new Date(row.end_at as string) : null,
    allDay: row.all_day === 1,
    location: (row.location as string) ?? null,
    recurrence: (row.recurrence as string) ?? null,
    status: row.status as CalendarEvent["status"],
  };
}
