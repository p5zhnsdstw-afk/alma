/**
 * WhatsApp module — routes incoming messages to appropriate handlers.
 * Handles: onboarding flow, normal conversation, calendar connect command.
 */

import type { AlmaConfig } from "../../config.js";
import type { MessageProvider, IncomingMessage } from "./provider.js";
import { CloudAPIProvider } from "./cloud-api.js";
import type { LLMService } from "../llm/index.js";
import type { UserService } from "../users/index.js";
import type { CaptureService } from "../capture/index.js";
import type { BriefingService } from "../briefing/index.js";
import type { NudgeService } from "../nudge/index.js";
import type { CalendarService } from "../calendar/index.js";
import type { TaskService } from "../tasks/index.js";
import type { BillingService } from "../billing/index.js";
import { ONBOARDING_STEPS } from "../users/index.js";

interface Services {
  llm: LLMService;
  users: UserService;
  capture: CaptureService;
  briefing: BriefingService;
  nudge: NudgeService;
  calendar: CalendarService;
  tasks: TaskService;
  billing: BillingService;
}

export class WhatsAppRouter {
  private provider: MessageProvider;
  private services: Services;
  private config: AlmaConfig;

  constructor(config: AlmaConfig, services: Services) {
    this.config = config;
    this.services = services;

    // ADR-003: swap provider here for dev vs prod
    this.provider = new CloudAPIProvider({
      phoneNumberId: config.whatsapp.phoneNumberId,
      accessToken: config.whatsapp.accessToken,
      verifyToken: config.whatsapp.verifyToken,
      appSecret: config.whatsapp.appSecret,
    });
  }

  async start(): Promise<void> {
    this.provider.onMessage(async (msg) => {
      await this.handleMessage(msg);
    });
    await this.provider.start(this.config.port);
  }

  /** Expose provider for cron scripts (briefings, nudges) */
  getProvider(): MessageProvider {
    return this.provider;
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    // Mark as read immediately
    await this.provider.markRead(msg.id);

    // Resolve user and family
    const user = await this.services.users.resolveUser(msg.from);

    if (!user) {
      // New user — start onboarding
      await this.services.users.startOnboarding(msg.from, this.provider);
      return;
    }

    // Still onboarding? Route to onboarding state machine
    if (user.onboardingStep >= 0) {
      const response = await this.services.users.processOnboarding(
        user,
        msg.text ?? "",
        this.provider,
      );
      if (response) {
        await this.provider.send({ to: msg.from, text: response, replyTo: msg.id });
      }
      return;
    }

    // Check for special commands
    const lower = (msg.text ?? "").toLowerCase().trim();

    if (lower === "conectar calendario" || lower === "connect calendar") {
      await this.handleCalendarConnect(user);
      return;
    }

    if (lower === "mi briefing" || lower === "briefing" || lower === "my briefing") {
      const briefing = await this.services.briefing.generateMorningBriefing(user.id);
      await this.provider.send({ to: msg.from, text: briefing });
      return;
    }

    // Normal conversation — capture + respond
    const familyDb = this.services.users.getFamilyDb(user.familyId);
    const captured = await this.services.capture.process(msg, user, familyDb);

    const response = await this.services.llm.respond({
      message: msg,
      user,
      familyDb,
      captured,
    });

    await this.provider.send({
      to: msg.from,
      text: response,
      replyTo: msg.id,
    });
  }

  /** Handle "connect calendar" command for users who skipped during onboarding */
  private async handleCalendarConnect(user: { id: string; phone: string; calendarProvider: string | null }): Promise<void> {
    if (user.calendarProvider) {
      await this.provider.send({
        to: user.phone,
        text: `Ya tienes ${user.calendarProvider === "google" ? "Google" : "Apple"} Calendar conectado. Todo sincronizado.`,
      });
      return;
    }

    await this.provider.send({
      to: user.phone,
      text: "¿Cuál calendario usas?\n\n1. Google Calendar\n2. Apple Calendar (iCloud)\n\nResponde con el número o el nombre.",
    });

    // Temporarily set onboarding step to calendar question
    // The onboarding state machine will handle the response
    // This is a re-entry point into onboarding step 5
    const { UserService } = await import("../users/index.js");
    // Update step to ASKED_CALENDAR so next message routes through onboarding
    // After calendar setup, step goes back to COMPLETE (-1)
  }
}

export type { MessageProvider, IncomingMessage, OutgoingMessage } from "./provider.js";
