/**
 * Capture module — voice/text to structured items.
 * Job Story: "When a to-do pops into my head mid-task, I want to send a quick
 * voice note or text and have it handled, so I can capture in 5 seconds."
 */

import type { LLMService } from "../llm/index.js";
import type { TaskService } from "../tasks/index.js";
import type { CalendarService } from "../calendar/index.js";
import type { IncomingMessage } from "../whatsapp/provider.js";
import type Database from "better-sqlite3";

interface CapturedItem {
  type: "task" | "event" | "reminder" | "note";
  title: string;
  dueAt?: Date;
  assignedTo?: string;
  raw: string;
}

export class CaptureService {
  constructor(
    private llm: LLMService,
    private tasks: TaskService,
    private calendar: CalendarService,
  ) {}

  async process(
    msg: IncomingMessage,
    user: { id: string; familyId: string },
    familyDb: Database.Database,
  ): Promise<CapturedItem | null> {
    let text = msg.text ?? "";

    // Transcribe audio if voice note
    if (msg.type === "audio" && msg.audioUrl) {
      // TODO: download audio from WhatsApp, transcribe via LLM
      text = "[audio transcription placeholder]";
    }

    if (!text.trim()) return null;

    // TODO: use LLM to classify and extract structured item
    // For now, store as raw note
    return {
      type: "note",
      title: text.slice(0, 100),
      raw: text,
    };
  }
}
