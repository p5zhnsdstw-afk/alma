/**
 * Briefing module — morning/evening briefings.
 * MVP C: Includes delivery stats (messages sent, confirmed, pending).
 *
 * NC-1: Users receive tangible value within 24 hours (first morning briefing).
 *
 * The briefing reads from internal calendar regardless of sync status.
 * WhatsApp-only users see events they told Alma about.
 * Synced users see everything from their Google/Apple calendar.
 */

import type { LLMService, LLMMessage } from "../llm/index.js";
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
    private llm: LLMService,
    private calendar: CalendarService,
    private tasks: TaskService,
    private users: UserService,
    private maintenance?: MaintenanceService,
    private delivery?: DeliveryService,
  ) {}

  /** Generate morning briefing for a user */
  async generateMorningBriefing(userId: string): Promise<string> {
    const user = await this.users.getUser(userId);
    if (!user) return "";

    const familyDb = this.users.getFamilyDb(user.familyId);

    // Gather all data sources
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

    // If user has NOTHING — still deliver value
    if (this.isEmpty(data)) {
      return this.buildEmptyBriefing(data);
    }

    return this.buildBriefingWithLLM(data);
  }

  /** Generate evening summary */
  async generateEveningSummary(userId: string): Promise<string> {
    const user = await this.users.getUser(userId);
    if (!user) return "";

    const familyDb = this.users.getFamilyDb(user.familyId);

    const tomorrowEvents = this.calendar.getUpcoming(familyDb, user.id, 1);
    const pendingTasks = await this.tasks.getPending(user.familyId, user.id);

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: [
          "You are Alma. Generate a brief evening summary in the user's language.",
          "Max 3-4 sentences. Warm tone. End with something encouraging.",
          `User: ${user.name}, language: ${user.language}`,
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          tomorrowEvents: tomorrowEvents.map(formatEvent),
          pendingTasks: pendingTasks.map((t) => t.title),
        }),
      },
    ];

    const response = await this.llm.generate(messages);
    return response.text;
  }

  private getFamilyMemberEvents(
    familyDb: ReturnType<UserService["getFamilyDb"]>,
    currentUser: User,
  ): CalendarEvent[] {
    const allToday = this.calendar.getFamilyToday(familyDb);
    return allToday.filter((e) => e.userId !== currentUser.id);
  }

  private isEmpty(data: BriefingData): boolean {
    return (
      data.events.length === 0 &&
      data.familyEvents.length === 0 &&
      data.pendingTasks.length === 0 &&
      data.overdueTasks.length === 0 &&
      data.maintenanceDue.length === 0 &&
      data.deliveryStats.sentYesterday === 0 &&
      data.deliveryStats.pendingNow === 0
    );
  }

  private buildEmptyBriefing(data: BriefingData): string {
    const name = data.user.name.split(" ")[0];
    const lang = data.user.language;

    if (lang === "es") {
      const lines = [`Buenos días, ${name}. Hoy tienes el día libre de compromisos.`];

      if (!data.calendarConnected) {
        lines.push(
          "",
          "Tip: si conectas tu calendario puedo mostrarte tus eventos automáticamente. Dime \"conectar calendario\" cuando quieras.",
        );
      }

      return lines.join("\n");
    }

    const lines = [`Good morning, ${name}. Your day is clear — no commitments.`];

    if (!data.calendarConnected) {
      lines.push(
        "",
        'Tip: connect your calendar and I\'ll sync your events automatically. Just say "connect calendar" anytime.',
      );
    }

    return lines.join("\n");
  }

  private async buildBriefingWithLLM(data: BriefingData): Promise<string> {
    const context: Record<string, unknown> = {
      todayEvents: data.events.map(formatEvent),
      pendingTasks: data.pendingTasks.map((t) => ({
        title: t.title,
        due: t.dueAt?.toISOString(),
        assigned: t.assignedTo,
      })),
    };

    if (data.familyEvents.length > 0) {
      context.familyMemberEvents = data.familyEvents.map(formatEvent);
    }
    if (data.overdueTasks.length > 0) {
      context.overdueTasks = data.overdueTasks.map((t) => t.title);
    }
    if (data.maintenanceDue.length > 0) {
      context.maintenanceDue = data.maintenanceDue.map((m) => ({
        item: m.item_name,
        task: m.task,
        due: m.next_due,
        priority: m.priority,
      }));
    }

    // MVP C: delivery stats
    if (data.deliveryStats.sentYesterday > 0 || data.deliveryStats.pendingNow > 0) {
      context.deliveryStats = {
        sentYesterday: data.deliveryStats.sentYesterday,
        confirmedYesterday: data.deliveryStats.confirmedYesterday,
        pendingNow: data.deliveryStats.pendingNow,
      };
      if (data.pendingDeliveries.length > 0) {
        context.pendingDeliveryDetails = data.pendingDeliveries.map((d) => ({
          to: d.recipientName,
          about: d.messageBody,
        }));
      }
    }

    const calendarNote = data.calendarConnected
      ? ""
      : "\nNote: this user has NO calendar sync. Gently suggest connecting once (not every briefing — only if <3 events total).";

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: [
          "You are Alma, an AI Home & Life Manager. Generate a morning briefing.",
          `User: ${data.user.name}, language: ${data.user.language}`,
          "",
          "Rules:",
          "- Start with 'Buenos días, [name]' or 'Good morning, [name]'",
          "- List events chronologically with times",
          "- Mention overdue tasks with gentle urgency",
          "- Mention maintenance items if any (be specific: what, why, what to do)",
          "- If family members have events, include relevant ones (pickups, shared commitments)",
          "- If there are delivery stats, add a 'Mensajes' section:",
          "  Show counts and details ONLY for pending deliveries (confirmed ones just tallied)",
          '  Example: "Ayer enviaste 3 mensajes: 2 confirmados. Pendiente: Pedro (sacar la basura)"',
          "  Max 2-3 lines for this section",
          "- End with one clear action or encouragement",
          "- MAX 8-10 lines. Brief. Scannable. No walls of text.",
          "- Use bullet points or line breaks, not paragraphs",
          calendarNote,
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(context),
      },
    ];

    const response = await this.llm.generate(messages);
    return response.text;
  }
}

function formatEvent(e: CalendarEvent): Record<string, unknown> {
  return {
    title: e.title,
    time: e.allDay ? "all day" : e.startAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    location: e.location,
    end: e.endAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}
