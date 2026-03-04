/**
 * ADR-004: LLM Provider Abstraction
 * Can switch models in minutes. Gemini Flash default, route complex tasks to Pro/Sonnet.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  latencyMs: number;
}

export interface LLMProvider {
  /** Generate a completion */
  generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse>;

  /** Transcribe audio to text */
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}

export interface GenerateOptions {
  /** Temperature (0-2) */
  temperature?: number;
  /** Max output tokens */
  maxTokens?: number;
  /** Force a specific model tier */
  tier?: "fast" | "smart";
  /** Disable thinking/reasoning tokens (saves 6x on output cost) */
  disableThinking?: boolean;
}
