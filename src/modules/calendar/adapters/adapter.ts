/**
 * Calendar sync adapter interface.
 * Each external calendar provider implements this.
 */

import type { CalendarEvent } from "../index.js";

export interface ExternalEvent {
  externalId: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  location: string | null;
  status: "confirmed" | "tentative" | "cancelled";
}

export interface CalendarAdapter {
  /** Fetch events from external calendar (next 14 days by default) */
  fetchEvents(calendarId: string, token: string, daysAhead?: number): Promise<ExternalEvent[]>;

  /** Create an event in the external calendar. Returns external event ID. */
  createEvent(
    calendarId: string,
    token: string,
    event: CalendarEvent,
  ): Promise<string | null>;

  /** Update an event in the external calendar */
  updateEvent(
    calendarId: string,
    token: string,
    externalId: string,
    event: Partial<CalendarEvent>,
  ): Promise<boolean>;

  /** Delete an event from the external calendar */
  deleteEvent(calendarId: string, token: string, externalId: string): Promise<boolean>;

  /** Exchange authorization code for refresh token (OAuth flow) */
  exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; calendarId: string }>;
}
