/**
 * Safe LLM JSON response parsing with validation.
 *
 * LLMs often return JSON wrapped in markdown fences, with trailing commas,
 * or with extra text. This utility handles all common malformations.
 */

import { log } from "./logger.js";

/**
 * Validator function: returns null if valid, error message string if invalid.
 */
export type Validator<T> = (parsed: unknown) => T | null;

/**
 * Parse an LLM response as JSON with validation.
 *
 * 1. Strips markdown code fences (```json ... ```)
 * 2. Extracts first JSON object/array from response
 * 3. Parses JSON
 * 4. Validates with provided validator
 * 5. Returns fallback on any failure
 *
 * @param raw Raw LLM response text
 * @param validate Validator that returns typed result or null if invalid
 * @param fallback Default value if parsing/validation fails
 * @param module Module name for logging
 */
export function parseLLMJson<T>(
  raw: string,
  validate: Validator<T>,
  fallback: T,
  module = "llm-parse",
): T {
  try {
    const cleaned = extractJson(raw);
    if (!cleaned) {
      log.warn(module, "No JSON found in LLM response", { raw: truncate(raw, 200) });
      return fallback;
    }

    const parsed: unknown = JSON.parse(cleaned);
    const result = validate(parsed);

    if (result === null) {
      log.warn(module, "LLM response failed validation", {
        parsed,
        raw: truncate(raw, 200),
      });
      return fallback;
    }

    return result;
  } catch (error) {
    log.warn(module, "Failed to parse LLM JSON response", {
      error: error instanceof Error ? error.message : String(error),
      raw: truncate(raw, 200),
    });
    return fallback;
  }
}

/**
 * Extract JSON string from LLM response.
 * Handles markdown fences, leading/trailing text, etc.
 */
function extractJson(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  let text = raw.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try parsing as-is first (most common case)
  if (isJsonLike(text)) return text;

  // Find first { or [ and match to closing brace/bracket
  const startObj = text.indexOf("{");
  const startArr = text.indexOf("[");

  let start: number;
  let openChar: string;
  let closeChar: string;

  if (startObj === -1 && startArr === -1) return null;

  if (startArr === -1 || (startObj !== -1 && startObj < startArr)) {
    start = startObj;
    openChar = "{";
    closeChar = "}";
  } else {
    start = startArr;
    openChar = "[";
    closeChar = "]";
  }

  // Find matching closing bracket (handle nesting)
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

function isJsonLike(text: string): boolean {
  return (text.startsWith("{") && text.endsWith("}")) ||
         (text.startsWith("[") && text.endsWith("]"));
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

// ─── Common validators for Alma ───────────────────────────────────────

/** Delivery intent: { intent: boolean, who?: string, what?: string, when?: string | null } */
export interface DeliveryIntentResult {
  intent: boolean;
  who?: string;
  what?: string;
  when?: string | null;
}

export function validateDeliveryIntent(parsed: unknown): DeliveryIntentResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.intent !== "boolean") return null;

  if (obj.intent) {
    if (typeof obj.who !== "string" || !obj.who.trim()) return null;
    if (typeof obj.what !== "string" || !obj.what.trim()) return null;
    // "when" can be string or null
    if (obj.when !== null && obj.when !== undefined && typeof obj.when !== "string") return null;
  }

  return {
    intent: obj.intent,
    who: typeof obj.who === "string" ? obj.who.trim() : undefined,
    what: typeof obj.what === "string" ? obj.what.trim() : undefined,
    when: typeof obj.when === "string" ? obj.when.trim() : null,
  };
}

/** Reply classification: { type: "confirmation" | "pushback" | "unrelated", text?: string } */
export interface ReplyClassificationResult {
  type: "confirmation" | "pushback" | "unrelated";
  text?: string;
}

const VALID_REPLY_TYPES = new Set(["confirmation", "pushback", "unrelated"]);

export function validateReplyClassification(parsed: unknown): ReplyClassificationResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.type !== "string" || !VALID_REPLY_TYPES.has(obj.type)) return null;

  return {
    type: obj.type as ReplyClassificationResult["type"],
    text: typeof obj.text === "string" ? obj.text : undefined,
  };
}

/** Captured item: { type, title, dueAt?, assignedTo? } */
export interface CapturedItemResult {
  type: "task" | "event" | "reminder" | "note";
  title: string;
  dueAt?: string;
  assignedTo?: string;
}

const VALID_ITEM_TYPES = new Set(["task", "event", "reminder", "note"]);

export function validateCapturedItem(parsed: unknown): CapturedItemResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const type = typeof obj.type === "string" && VALID_ITEM_TYPES.has(obj.type)
    ? obj.type as CapturedItemResult["type"]
    : "note";

  const title = typeof obj.title === "string" ? obj.title.trim() : null;
  if (!title) return null;

  return {
    type,
    title,
    dueAt: typeof obj.dueAt === "string" ? obj.dueAt : undefined,
    assignedTo: typeof obj.assignedTo === "string" ? obj.assignedTo : undefined,
  };
}

/** Family contact extraction: array of { name, relationship? } */
export interface FamilyContactResult {
  name: string;
  relationship?: string;
}

export function validateFamilyContacts(parsed: unknown): FamilyContactResult[] | null {
  if (!Array.isArray(parsed)) return null;

  const results: FamilyContactResult[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;

    const name = typeof obj.name === "string" ? obj.name.trim() : null;
    if (!name) continue;

    results.push({
      name,
      relationship: typeof obj.relationship === "string" ? obj.relationship.trim() : undefined,
    });
  }

  return results.length > 0 ? results : null;
}

/** Delivery message composition: { message: string } */
export function validateDeliveryMessage(parsed: unknown): { message: string } | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const message = typeof obj.message === "string" ? obj.message.trim() : null;
  if (!message) return null;

  return { message };
}
