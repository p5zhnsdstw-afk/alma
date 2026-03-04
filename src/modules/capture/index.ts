/**
 * Capture module — voice/text to structured items.
 * MVP C: Delivery intent detection is the FIRST check.
 *
 * Flow:
 * 1. Transcribe audio if voice note
 * 2. Check delivery intent (WHO + WHAT + WHEN extraction)
 * 3. Fall through to task/event/reminder/note classification
 */

import type { LLMService } from "../llm/index.js";
import type { TaskService } from "../tasks/index.js";
import type { CalendarService } from "../calendar/index.js";
import type { DeliveryService, DeliveryIntent } from "../delivery/index.js";
import type { IncomingMessage, MessageProvider } from "../whatsapp/provider.js";
import type { User } from "../users/index.js";
import type Database from "better-sqlite3";
import { log } from "../../utils/logger.js";
import { parseLLMJson, validateCapturedItem } from "../../utils/llm-parse.js";

const MAX_INPUT_LENGTH = 4096;
const MOD = "capture";

export interface CapturedItem {
  readonly kind: "item";
  readonly type: "task" | "event" | "reminder" | "note";
  readonly title: string;
  readonly dueAt?: Date;
  readonly assignedTo?: string;
  readonly raw: string;
}

export type CaptureResult = DeliveryIntent | CapturedItem | null;

export class CaptureService {
  private delivery?: DeliveryService;
  private provider?: MessageProvider;

  constructor(
    private llm: LLMService,
    private tasks: TaskService,
    private calendar: CalendarService,
  ) {}

  /** Late-bind provider for media downloads */
  setProvider(provider: MessageProvider): void {
    this.provider = provider;
  }

  /** Late-bind delivery service to avoid circular dependency */
  setDeliveryService(delivery: DeliveryService): void {
    this.delivery = delivery;
  }

  async process(
    msg: IncomingMessage,
    user: User,
    familyDb: Database.Database,
  ): Promise<CaptureResult> {
    let text = msg.text ?? "";

    // 1. Transcribe audio if voice note
    if (msg.type === "audio" && msg.audioUrl) {
      if (!this.provider) {
        log.warn(MOD, "MessageProvider not bound — cannot download media");
        return { kind: "item", type: "note", title: "__transcription_failed__", raw: "" };
      }
      try {
        const audioBuffer = await this.provider.downloadMedia(msg.audioUrl);
        text = await this.llm.transcribe(audioBuffer, "audio/ogg");
        log.info(MOD, "audio transcribed", { length: text.length });
      } catch (error) {
        log.error(MOD, "audio transcription failed", error);
        // Return a specific error so the router can tell the user
        return {
          kind: "item",
          type: "note",
          title: "__transcription_failed__",
          raw: "",
        };
      }
    }

    if (!text.trim()) return null;

    // Truncate excessively long messages
    if (text.length > MAX_INPUT_LENGTH) {
      text = text.slice(0, MAX_INPUT_LENGTH);
      log.warn(MOD, "message truncated", { originalLength: text.length });
    }

    // 2. Check delivery intent FIRST (MVP C core loop)
    if (this.delivery) {
      const intent = await this.delivery.detectIntent(text, user);
      if (intent) return intent;
    } else {
      log.warn(MOD, "DeliveryService not bound — delivery intent detection disabled");
    }

    // 3. Classify into task/event/reminder/note via LLM
    return this.classifyItem(text);
  }

  private async classifyItem(text: string): Promise<CapturedItem> {
    try {
      const response = await this.llm.generate(
        [
          {
            role: "system",
            content: [
              "Classify this message into one type. Output ONLY valid JSON:",
              '{"type":"task"|"event"|"reminder"|"note","title":"brief title","dueAt":"ISO datetime"|null}',
              "task = something to do. event = something with a specific date/time. reminder = time-based alert. note = everything else.",
            ].join("\n"),
          },
          { role: "user", content: text },
        ],
        { temperature: 0.2, maxTokens: 100 },
      );

      const parsed = parseLLMJson(
        response.text,
        validateCapturedItem,
        { type: "note" as const, title: text.slice(0, 100) },
        MOD,
      );

      return {
        kind: "item",
        type: parsed.type,
        title: parsed.title,
        dueAt: parsed.dueAt ? new Date(parsed.dueAt) : undefined,
        assignedTo: parsed.assignedTo,
        raw: text,
      };
    } catch (error) {
      log.error(MOD, "classifyItem failed", error);
      return {
        kind: "item",
        type: "note",
        title: text.slice(0, 100),
        raw: text,
      };
    }
  }

}
