/**
 * Apple Calendar sync adapter via CalDAV (RFC 4791).
 * MVP — required for mixed households (most common beachhead scenario).
 *
 * Apple iCloud CalDAV:
 *   Server: caldav.icloud.com
 *   Auth: App-specific password (not regular Apple ID password)
 *   Protocol: CalDAV (WebDAV + iCalendar)
 *
 * Onboarding flow for Apple users:
 *   1. User goes to appleid.apple.com → Security → App-Specific Passwords
 *   2. Generates password for "Alma"
 *   3. Sends it to Alma via WhatsApp
 *   4. Alma stores it (encrypted) and syncs
 *
 * Known challenges:
 *   - No OAuth — requires app-specific password (user friction)
 *   - iCloud CalDAV discovery requires principal URL lookup
 *   - Rate limiting is undocumented
 *   - 2FA is mandatory on Apple IDs (app-specific password bypasses)
 */

import type { AlmaConfig } from "../../../config.js";
import type { CalendarAdapter, ExternalEvent } from "./adapter.js";
import type { CalendarEvent } from "../index.js";

const CALDAV_BASE = "https://caldav.icloud.com";

export class AppleCalendarAdapter implements CalendarAdapter {
  constructor(private config: AlmaConfig) {}

  async fetchEvents(
    calendarUrl: string,
    credentials: string, // "apple_id:app_specific_password"
    daysAhead: number = 14,
  ): Promise<ExternalEvent[]> {
    const [appleId, appPassword] = credentials.split(":");
    const authHeader = "Basic " + Buffer.from(`${appleId}:${appPassword}`).toString("base64");

    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    // CalDAV REPORT request with time-range filter
    const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${formatICalDate(now)}" end="${formatICalDate(future)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const res = await fetch(calendarUrl, {
      method: "REPORT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
      },
      body: reportBody,
    });

    if (!res.ok) {
      throw new Error(`Apple CalDAV error: ${res.status} ${await res.text()}`);
    }

    const xml = await res.text();
    return parseCalDAVResponse(xml);
  }

  async createEvent(
    calendarUrl: string,
    credentials: string,
    event: CalendarEvent,
  ): Promise<string | null> {
    const [appleId, appPassword] = credentials.split(":");
    const authHeader = "Basic " + Buffer.from(`${appleId}:${appPassword}`).toString("base64");

    const uid = crypto.randomUUID();
    const eventUrl = `${calendarUrl}${uid}.ics`;

    const ical = buildICalEvent(uid, event);

    const res = await fetch(eventUrl, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*", // only create, don't overwrite
      },
      body: ical,
    });

    if (!res.ok) return null;
    return uid;
  }

  async updateEvent(
    calendarUrl: string,
    credentials: string,
    externalId: string,
    event: Partial<CalendarEvent>,
  ): Promise<boolean> {
    // CalDAV update = fetch current + modify + PUT with If-Match
    const [appleId, appPassword] = credentials.split(":");
    const authHeader = "Basic " + Buffer.from(`${appleId}:${appPassword}`).toString("base64");

    const eventUrl = `${calendarUrl}${externalId}.ics`;

    // Get current etag
    const headRes = await fetch(eventUrl, {
      method: "HEAD",
      headers: { Authorization: authHeader },
    });
    if (!headRes.ok) return false;

    const etag = headRes.headers.get("ETag");

    // Build updated iCal (need full event for PUT)
    // For now, build from partial — caller should provide full event
    const fullEvent = event as CalendarEvent;
    const ical = buildICalEvent(externalId, fullEvent);

    const res = await fetch(eventUrl, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "text/calendar; charset=utf-8",
        ...(etag ? { "If-Match": etag } : {}),
      },
      body: ical,
    });

    return res.ok;
  }

  async deleteEvent(
    calendarUrl: string,
    credentials: string,
    externalId: string,
  ): Promise<boolean> {
    const [appleId, appPassword] = credentials.split(":");
    const authHeader = "Basic " + Buffer.from(`${appleId}:${appPassword}`).toString("base64");

    const eventUrl = `${calendarUrl}${externalId}.ics`;

    const res = await fetch(eventUrl, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });

    return res.ok;
  }

  async exchangeCode(
    _code: string,
    _redirectUri: string,
  ): Promise<{ refreshToken: string; calendarId: string }> {
    // Apple doesn't use OAuth for CalDAV.
    // "code" here is "apple_id:app_specific_password"
    // "calendarId" is the discovered calendar URL
    const [appleId, appPassword] = _code.split(":");

    // Discover principal and calendar URLs
    const calendarUrl = await this.discoverCalendar(appleId, appPassword);

    return {
      refreshToken: _code, // credentials stored as token (encrypted at rest)
      calendarId: calendarUrl,
    };
  }

  /** Discover the user's default calendar URL via CalDAV principal lookup */
  private async discoverCalendar(appleId: string, appPassword: string): Promise<string> {
    const authHeader = "Basic " + Buffer.from(`${appleId}:${appPassword}`).toString("base64");

    // Step 1: Find current user principal
    const principalRes = await fetch(CALDAV_BASE, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "0",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`,
    });

    const principalXml = await principalRes.text();
    const principalUrl = extractHref(principalXml, "current-user-principal");

    if (!principalUrl) {
      throw new Error("Could not discover Apple CalDAV principal");
    }

    // Step 2: Find calendar home set
    const homeRes = await fetch(`${CALDAV_BASE}${principalUrl}`, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "0",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`,
    });

    const homeXml = await homeRes.text();
    const homeUrl = extractHref(homeXml, "calendar-home-set");

    if (!homeUrl) {
      throw new Error("Could not discover Apple CalDAV calendar home");
    }

    // Step 3: List calendars, find the default one
    const listRes = await fetch(`${CALDAV_BASE}${homeUrl}`, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <A:calendar-color/>
  </D:prop>
</D:propfind>`,
    });

    const listXml = await listRes.text();
    // Find first calendar resource (has <D:resourcetype><C:calendar/></D:resourcetype>)
    const calUrl = extractFirstCalendarHref(listXml);

    return calUrl ?? `${CALDAV_BASE}${homeUrl}`;
  }
}

// --- iCalendar helpers ---

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildICalEvent(uid: string, event: CalendarEvent): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alma//AI Home Manager//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatICalDate(new Date())}`,
    `SUMMARY:${escapeICalText(event.title)}`,
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${event.startAt.toISOString().split("T")[0].replace(/-/g, "")}`);
    if (event.endAt) {
      lines.push(`DTEND;VALUE=DATE:${event.endAt.toISOString().split("T")[0].replace(/-/g, "")}`);
    }
  } else {
    lines.push(`DTSTART:${formatICalDate(event.startAt)}`);
    if (event.endAt) {
      lines.push(`DTEND:${formatICalDate(event.endAt)}`);
    }
  }

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }
  if (event.recurrence) {
    lines.push(event.recurrence); // Already an RRULE line
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// --- XML helpers (lightweight, no dependency) ---

function extractHref(xml: string, tagName: string): string | null {
  // Find <tagName><D:href>...</D:href></tagName>
  const tagRegex = new RegExp(`<[^>]*${tagName}[^>]*>[\\s\\S]*?<[^>]*href[^>]*>([^<]+)<`, "i");
  const match = xml.match(tagRegex);
  return match?.[1]?.trim() ?? null;
}

function extractFirstCalendarHref(xml: string): string | null {
  // Find response elements that contain <calendar/> in resourcetype
  const responses = xml.split(/<\/?[Dd]:response>/);
  for (const resp of responses) {
    if (resp.includes("calendar") && !resp.includes("schedule-inbox") && !resp.includes("schedule-outbox")) {
      const hrefMatch = resp.match(/<[^>]*href[^>]*>([^<]+)</i);
      if (hrefMatch) return hrefMatch[1].trim();
    }
  }
  return null;
}

function parseCalDAVResponse(xml: string): ExternalEvent[] {
  const events: ExternalEvent[] = [];

  // Split by response elements and extract calendar-data
  const responses = xml.split(/<\/?[Dd]:response>/);
  for (const resp of responses) {
    const calDataMatch = resp.match(/<[^>]*calendar-data[^>]*>([\s\S]*?)<\//i);
    if (!calDataMatch) continue;

    const ical = calDataMatch[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

    const event = parseICalEvent(ical);
    if (event) events.push(event);
  }

  return events;
}

function parseICalEvent(ical: string): ExternalEvent | null {
  const getValue = (key: string): string | null => {
    const regex = new RegExp(`^${key}[;:](.*)$`, "mi");
    const match = ical.match(regex);
    if (!match) return null;
    // Handle parameters (e.g., DTSTART;VALUE=DATE:20260301)
    const val = match[1];
    const colonIdx = val.indexOf(":");
    return colonIdx >= 0 ? val.slice(colonIdx + 1) : val;
  };

  const uid = getValue("UID");
  const summary = getValue("SUMMARY");
  if (!uid || !summary) return null;

  const dtstart = getValue("DTSTART");
  if (!dtstart) return null;

  const allDay = dtstart.length === 8; // YYYYMMDD vs YYYYMMDDTHHMMSSZ
  const startAt = parseICalDate(dtstart);
  if (!startAt) return null;

  const dtend = getValue("DTEND");
  const endAt = dtend ? parseICalDate(dtend) : null;

  const status = getValue("STATUS")?.toLowerCase() ?? "confirmed";

  return {
    externalId: uid,
    title: unescapeICalText(summary),
    description: getValue("DESCRIPTION") ? unescapeICalText(getValue("DESCRIPTION")!) : null,
    startAt,
    endAt,
    allDay,
    location: getValue("LOCATION") ? unescapeICalText(getValue("LOCATION")!) : null,
    status: status as ExternalEvent["status"],
  };
}

function parseICalDate(str: string): Date | null {
  // YYYYMMDD or YYYYMMDDTHHMMSSZ
  if (str.length === 8) {
    return new Date(`${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`);
  }
  const cleaned = str.replace(/[^0-9TZ]/g, "");
  if (cleaned.length >= 15) {
    const iso = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}T${cleaned.slice(9, 11)}:${cleaned.slice(11, 13)}:${cleaned.slice(13, 15)}Z`;
    return new Date(iso);
  }
  return null;
}

function unescapeICalText(text: string): string {
  return text.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
