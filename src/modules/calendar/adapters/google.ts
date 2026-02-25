/**
 * Google Calendar sync adapter.
 * MVP — this is the first sync adapter.
 * Uses Google Calendar API v3 with OAuth2 refresh tokens.
 */

import type { AlmaConfig } from "../../../config.js";
import type { CalendarAdapter, ExternalEvent } from "./adapter.js";
import type { CalendarEvent } from "../index.js";

export class GoogleCalendarAdapter implements CalendarAdapter {
  constructor(private config: AlmaConfig) {}

  async fetchEvents(
    calendarId: string,
    refreshToken: string,
    daysAhead: number = 14,
  ): Promise<ExternalEvent[]> {
    const accessToken = await this.getAccessToken(refreshToken);

    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Google Calendar API error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { items?: GoogleEvent[] };

    return (data.items ?? []).map((item) => ({
      externalId: item.id,
      title: item.summary ?? "(sin titulo)",
      description: item.description ?? null,
      startAt: new Date(item.start?.dateTime ?? item.start?.date ?? ""),
      endAt: item.end ? new Date(item.end.dateTime ?? item.end.date ?? "") : null,
      allDay: !item.start?.dateTime,
      location: item.location ?? null,
      status: (item.status as ExternalEvent["status"]) ?? "confirmed",
    }));
  }

  async createEvent(
    calendarId: string,
    refreshToken: string,
    event: CalendarEvent,
  ): Promise<string | null> {
    const accessToken = await this.getAccessToken(refreshToken);

    const body: Record<string, unknown> = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.allDay
        ? { date: event.startAt.toISOString().split("T")[0] }
        : { dateTime: event.startAt.toISOString() },
      end: event.endAt
        ? event.allDay
          ? { date: event.endAt.toISOString().split("T")[0] }
          : { dateTime: event.endAt.toISOString() }
        : event.allDay
          ? { date: event.startAt.toISOString().split("T")[0] }
          : { dateTime: new Date(event.startAt.getTime() + 3600000).toISOString() },
    };

    if (event.recurrence) {
      body.recurrence = [event.recurrence];
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async updateEvent(
    calendarId: string,
    refreshToken: string,
    externalId: string,
    event: Partial<CalendarEvent>,
  ): Promise<boolean> {
    const accessToken = await this.getAccessToken(refreshToken);

    const body: Record<string, unknown> = {};
    if (event.title) body.summary = event.title;
    if (event.description !== undefined) body.description = event.description;
    if (event.location !== undefined) body.location = event.location;
    if (event.startAt) {
      body.start = event.allDay
        ? { date: event.startAt.toISOString().split("T")[0] }
        : { dateTime: event.startAt.toISOString() };
    }
    if (event.endAt) {
      body.end = event.allDay
        ? { date: event.endAt.toISOString().split("T")[0] }
        : { dateTime: event.endAt.toISOString() };
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${externalId}`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return res.ok;
  }

  async deleteEvent(
    calendarId: string,
    refreshToken: string,
    externalId: string,
  ): Promise<boolean> {
    const accessToken = await this.getAccessToken(refreshToken);

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${externalId}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return res.ok;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{ refreshToken: string; calendarId: string }> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.google.serviceAccountKeyPath, // TODO: use OAuth client ID
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const data = (await res.json()) as { refresh_token: string };

    return {
      refreshToken: data.refresh_token,
      calendarId: "primary", // default to user's primary calendar
    };
  }

  private async getAccessToken(refreshToken: string): Promise<string> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.google.serviceAccountKeyPath, // TODO: use OAuth client ID
        grant_type: "refresh_token",
      }),
    });

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}
