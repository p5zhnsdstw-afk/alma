/**
 * LLM service — manages provider selection and cost tracking.
 * Routes 80% to Flash (cheap), 20% to Pro (complex reasoning).
 */

import type { AlmaConfig } from "../../config.js";
import type { LLMProvider, LLMResponse, LLMMessage } from "./provider.js";
import { GeminiProvider } from "./gemini.js";
import type { IncomingMessage } from "../whatsapp/provider.js";
import type Database from "better-sqlite3";

interface RespondContext {
  message: IncomingMessage;
  user: { id: string; name: string; role: string; familyId: string };
  familyDb: Database.Database;
  captured: unknown;
}

export class LLMService {
  private provider: LLMProvider;

  constructor(config: AlmaConfig) {
    this.provider = new GeminiProvider(config.llm.geminiApiKey);
  }

  async respond(ctx: RespondContext): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(ctx);
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: ctx.message.text ?? "[audio/media message]" },
    ];

    const response = await this.provider.generate(messages);
    // TODO: log cost to master DB for per-user COGS tracking
    return response.text;
  }

  async generate(messages: LLMMessage[]): Promise<LLMResponse> {
    return this.provider.generate(messages);
  }

  async transcribe(audio: Buffer, mime: string): Promise<string> {
    return this.provider.transcribe(audio, mime);
  }

  private buildSystemPrompt(ctx: RespondContext): string {
    return [
      "You are Alma, an AI Home & Life Manager.",
      "You are warm, competent, and brief. Max 3-4 sentences per message.",
      "You never lecture. You assume competence. One clear action per message.",
      `User: ${ctx.user.name} (${ctx.user.role})`,
      `Family ID: ${ctx.user.familyId}`,
      // TODO: inject family context from SQLite (calendar, tasks, home profile)
    ].join("\n");
  }
}

export type { LLMProvider, LLMResponse, LLMMessage } from "./provider.js";
