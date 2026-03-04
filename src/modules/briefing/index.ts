/**
 * Briefing module — morning/evening briefings.
 * MVP C: Includes delivery stats (messages sent, confirmed, pending).
 *
 * NC-1: Users receive tangible value within 24 hours (first morning briefing).
 *
 * COST OPTIMIZATION: Template-based (no LLM calls).
 * The briefing reads from internal calendar regardless of sync status.
 * WhatsApp-only users see events they told Alma about.
 * Synced users see everything from their Google/Apple calendar.
 */

import type { CalendarService, CalendarEvent } from "../calendar/index.js";
import type { TaskService, Task } from "../tasks/index.js";
import type { UserService, User } from "../users/index.js";
import type { MaintenanceService, MaintenanceTask } from "../maintenance/index.js";
import type { DeliveryService, DeliveryStats } from "../delivery/index.js";

interface BriefingData {
  user: User;
  events: CalendarEvent[];
  familyEvents: CalendarEvent[];
  pendingTasks: Task[];
  overdueTasks: Task[];
  maintenanceDue: MaintenanceTask[];
  calendarConnected: boolean;
  deliveryStats: DeliveryStats;
  pendingDeliveries: Array<{ recipientName: string; messageBody: string }>;
}

export class BriefingService {
  constructor(
    private calendar: CalendarService,
    private tasks: TaskService,
    private users: UserService,
    private maintenance?: MaintenanceService,
    private delivery?: DeliveryService,
  ) {}

  /** Generate morning briefing for a user (template-based, no LLM) */
  async generateMorningBriefing(userId: string): Promise<string> {
    const user = await this.users.getUser(userId);
    if (!user) return "";

    const familyDb = this.users.getFamilyDb(user.familyId);

    const data: BriefingData = {
      user,
      events: this.calendar.getTodayEvents(familyDb, user.id),
      familyEvents: this.getFamilyMemberEvents(familyDb, user),
      pendingTasks: await this.tasks.getPending(user.familyId, user.id),
      overdueTasks: await this.tasks.getOverdue(user.familyId),
      maintenanceDue: this.maintenance?.getOverdue(familyDb) ?? [],
      calendarConnected: user.calendarProvider !== null,
      deliveryStats: this.delivery?.getDeliveryStats(familyDb, user.id) ?? { sentYesterday: 0, confirmedYesterday: 0, pendingNow: 0 },
      pendingDeliveries: this.delivery?.getPendingDeliveryDetails(familyDb, user.id) ?? [],
    };

    return this.buildBriefing(data);
  }

  /** Generate evening summary (template-based, no LLM) */
  async generateEveningSummary(userId: string): Promise<string> {
    const user = await this.users.getUser(userId);
    if (!user) return "";

    const familyDb = this.users.getFamilyDb(user.familyId);
    const tomorrowEvents = this.calendar.getUpcoming(familyDb, user.id, 1);
    const pendingTasks = await this.tasks.getPending(user.familyId, user.id);
    const name = user.name.split(" ")[0];
    const es = user.language === "es";

    const lines: string[] = [];
    lines.push(es ? `Buenas noches, ${name}.` : `Good evening, ${name}.`);

    if (tomorrowEvents.length > 0) {
      lines.push("");
      lines.push(es ? "Mañana:" : "Tomorrow:");
      for (const e of tomorrowEvents) {
        const time = e.allDay ? (es ? "todo el día" : "all day") : formatTime(e.startAt);
        lines.push(`• ${time} — ${e.title}`);
      }
    }

    if (pendingTasks.length > 0) {
      lines.push("");
      lines.push(es ? "Pendientes:" : "Pending:");
      for (const t of pendingTasks.slice(0, 3)) {
        lines.push(`• ${t.title}`);
      }
    }

    if (tomorrowEvents.length === 0 && pendingTasks.length === 0) {
      lines.push(es ? "Mañana se ve tranquilo. Descansa bien." : "Tomorrow looks clear. Rest well.");
    } else {
      lines.push("");
      lines.push(es ? "Descansa bien." : "Rest well.");
    }

    return lines.join("\n");
  }

  private getFamilyMemberEvents(
    familyDb: ReturnType<UserService["getFamilyDb"]>,
    currentUser: User,
  ): CalendarEvent[] {
    const allToday = this.calendar.getFamilyToday(familyDb);
    return allToday.filter((e) => e.userId !== currentUser.id);
  }

  private buildBriefing(data: BriefingData): string {
    const name = data.user.name.split(" ")[0];
    const es = data.user.language === "es";
    const lines: string[] = [];

    // Greeting
    lines.push(es ? `Buenos días, ${name}.` : `Good morning, ${name}.`);

    // Events
    if (data.events.length > 0) {
      lines.push("");
      lines.push(es ? "Tu día:" : "Your day:");
      for (const e of data.events) {
        const time = e.allDay ? (es ? "todo el día" : "all day") : formatTime(e.startAt);
        const loc = e.location ? ` (${e.location})` : "";
        lines.push(`• ${time} — ${e.title}${loc}`);
      }
    }

    // Family events
    if (data.familyEvents.length > 0) {
      lines.push("");
      lines.push(es ? "Familia:" : "Family:");
      for (const e of data.familyEvents.slice(0, 3)) {
        const time = e.allDay ? (es ? "todo el día" : "all day") : formatTime(e.startAt);
        lines.push(`• ${time} — ${e.title}`);
      }
    }

    // Delivery stats (MVP C core value)
    const stats = data.deliveryStats;
    if (stats.sentYesterday > 0 || stats.pendingNow > 0) {
      lines.push("");
      lines.push(es ? "Mensajes:" : "Messages:");

      if (stats.sentYesterday > 0) {
        const confirmed = stats.confirmedYesterday;
        lines.push(es
          ? `• Ayer enviaste ${stats.sentYesterday}: ${confirmed} confirmados`
          : `• Yesterday you sent ${stats.sentYesterday}: ${confirmed} confirmed`);
      }

      if (stats.pendingNow > 0) {
        lines.push(es
          ? `• ${stats.pendingNow} sin respuesta:`
          : `• ${stats.pendingNow} awaiting reply:`);
        for (const d of data.pendingDeliveries.slice(0, 3)) {
          lines.push(`  → ${d.recipientName}: ${d.messageBody.slice(0, 50)}`);
        }
      }
    }

    // Overdue tasks
    if (data.overdueTasks.length > 0) {
      lines.push("");
      lines.push(es ? "Atrasados:" : "Overdue:");
      for (const t of data.overdueTasks.slice(0, 3)) {
        lines.push(`• ${t.title}`);
      }
    }

    // Pending tasks
    if (data.pendingTasks.length > 0) {
      lines.push("");
      lines.push(es ? "Pendientes:" : "To do:");
      for (const t of data.pendingTasks.slice(0, 3)) {
        lines.push(`• ${t.title}`);
      }
    }

    // Maintenance
    if (data.maintenanceDue.length > 0) {
      lines.push("");
      lines.push(es ? "Mantenimiento:" : "Maintenance:");
      for (const m of data.maintenanceDue.slice(0, 2)) {
        lines.push(`• ${m.item_name}: ${m.task}`);
      }
    }

    // Empty day
    if (data.events.length === 0 && data.pendingTasks.length === 0 && stats.pendingNow === 0) {
      lines.push(es ? "Hoy tienes el día libre." : "Your day is clear.");
    }

    // Calendar tip (only if nothing synced and few events)
    if (!data.calendarConnected && data.events.length < 2) {
      lines.push("");
      lines.push(es
        ? 'Tip: conecta tu calendario para ver tus eventos. Di "conectar calendario".'
        : 'Tip: connect your calendar to see your events. Say "connect calendar".');
    }

    return lines.join("\n");
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
