/**
 * LLM service — manages provider selection and cost tracking.
 * Routes 80% to Flash (cheap), 20% to Pro (complex reasoning).
 */

import type { AlmaConfig } from "../../config.js";
import type { LLMProvider, LLMResponse, LLMMessage, GenerateOptions } from "./provider.js";
import { GeminiProvider } from "./gemini.js";
import type { IncomingMessage } from "../whatsapp/provider.js";
import type Database from "better-sqlite3";
import { log } from "../../utils/logger.js";

interface RespondContext {
  message: IncomingMessage;
  user: { id: string; name: string; role: string; familyId: string; language?: string };
  familyDb: Database.Database;
  captured: unknown;
  recentEpisodes?: Array<{ role: string; content: string }>;
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
    ];

    // Inject conversation memory (recent episodes)
    if (ctx.recentEpisodes && ctx.recentEpisodes.length > 0) {
      for (const ep of ctx.recentEpisodes) {
        messages.push({
          role: ep.role === "assistant" ? "assistant" : "user",
          content: ep.content,
        });
      }
    }

    // Current message
    messages.push({
      role: "user",
      content: ctx.message.text ?? "[audio/media message]",
    });

    const response = await this.provider.generate(messages, {
      maxTokens: 300,
      disableThinking: true,
    });
    return response.text;
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    return this.provider.generate(messages, options);
  }

  async transcribe(audio: Buffer, mime: string): Promise<string> {
    return this.provider.transcribe(audio, mime);
  }

  private buildSystemPrompt(ctx: RespondContext): string {
    const lines = [
      "You are Alma, an AI Home & Life Manager.",
      "You are warm, competent, and brief. Max 3-4 sentences per message.",
      "You never lecture. You assume competence. One clear action per message.",
      `User: ${ctx.user.name} (${ctx.user.role})`,
      `Language: ${ctx.user.language ?? "es"}`,
      `Family ID: ${ctx.user.familyId}`,
    ];

    // Inject family context from SQLite
    try {
      const pendingDeliveries = ctx.familyDb
        .prepare(
          `SELECT recipient_name, message_body, status FROM deliveries
           WHERE sender_id = ? AND status IN ('scheduled', 'delivered', 'pending')
           ORDER BY created_at DESC LIMIT 5`,
        )
        .all(ctx.user.id) as Array<Record<string, unknown>>;

      if (pendingDeliveries.length > 0) {
        lines.push("");
        lines.push("Active deliveries:");
        for (const d of pendingDeliveries) {
          lines.push(`- To ${d.recipient_name}: "${d.message_body}" (${d.status})`);
        }
      }

      const todayEvents = ctx.familyDb
        .prepare(
          `SELECT title, start_at FROM calendar_events
           WHERE user_id = ? AND date(start_at) = date('now')
           ORDER BY start_at LIMIT 5`,
        )
        .all(ctx.user.id) as Array<Record<string, unknown>>;

      if (todayEvents.length > 0) {
        lines.push("");
        lines.push("Today's events:");
        for (const e of todayEvents) {
          lines.push(`- ${e.title} at ${e.start_at}`);
        }
      }
    } catch (error) {
      log.warn("llm", "failed to load family context for system prompt", { error: String(error) });
    }

    return lines.join("\n");
  }
}

export type { LLMProvider, LLMResponse, LLMMessage } from "./provider.js";
