/**
 * Gemini Flash implementation (D-8: primary LLM).
 * Gemini 2.5 Flash: Input $0.30/1M, Output $2.50/1M, Audio $1.00/1M.
 */

import type { LLMProvider, LLMMessage, LLMResponse, GenerateOptions } from "./provider.js";

const MODELS = {
  fast: "gemini-2.5-flash",
  smart: "gemini-2.5-pro",
} as const;

export class GeminiProvider implements LLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    const model = MODELS[options?.tier ?? "fast"];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system");

    const start = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(systemInstruction && {
          systemInstruction: { parts: [{ text: systemInstruction.content }] },
        }),
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 1024,
          ...(options?.disableThinking && { thinkingConfig: { thinkingBudget: 0 } }),
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      const error = new Error(`Gemini API ${res.status}: ${errorText.slice(0, 200)}`);
      (error as any).status = res.status;
      throw error;
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usage = data.usageMetadata;

    return {
      text,
      tokensIn: usage?.promptTokenCount ?? 0,
      tokensOut: usage?.candidatesTokenCount ?? 0,
      model,
      latencyMs: Date.now() - start,
    };
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Transcribe this audio exactly. Return only the transcription, nothing else." },
              {
                inlineData: {
                  mimeType,
                  data: audioBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      throw new Error(`Gemini transcribe ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}
