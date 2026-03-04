/**
 * Exponential backoff retry utility for transient failures.
 *
 * Handles:
 * - Transient errors (5xx, timeout, network) → retry with backoff
 * - Permanent errors (4xx except 429) → throw immediately
 * - Rate limiting (429) → respect Retry-After header
 */

import { log } from "./logger.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export interface RetryOptions {
  /** Max number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms, doubled each retry (default: 1000) */
  baseDelayMs?: number;
  /** Module name for logging */
  module?: string;
  /** Operation description for logging */
  operation?: string;
  /** Predicate to determine if error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean;
}

export class PermanentError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PermanentError";
  }
}

/**
 * Execute a function with exponential backoff retry on failure.
 * Throws PermanentError for non-retryable failures.
 * Throws the last error after all retries are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const mod = opts.module ?? "retry";
  const op = opts.operation ?? "unknown";

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Check if this is a permanent (non-retryable) error
      if (error instanceof PermanentError) {
        throw error;
      }

      if (opts.isRetryable && !opts.isRetryable(error)) {
        throw new PermanentError(`Non-retryable error in ${op}`, error);
      }

      // Check for rate limiting
      const retryAfterMs = extractRetryAfter(error);

      if (attempt === maxRetries) {
        log.error(mod, `All ${maxRetries} retries exhausted for ${op}`, error);
        break;
      }

      const delayMs = retryAfterMs ?? Math.min(baseDelay * 2 ** attempt, MAX_DELAY_MS);

      log.warn(mod, `Retry ${attempt + 1}/${maxRetries} for ${op} in ${delayMs}ms`, {
        attempt: attempt + 1,
        delayMs,
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Check if an HTTP error response indicates a transient failure.
 * Use as `isRetryable` option for HTTP-based operations.
 */
export function isHttpRetryable(error: unknown): boolean {
  if (error && typeof error === "object") {
    const status = (error as Record<string, unknown>).status ??
                   (error as Record<string, unknown>).statusCode;

    if (typeof status === "number") {
      // 429 = rate limited (retryable)
      // 5xx = server error (retryable)
      // 4xx (except 429) = client error (permanent)
      return status === 429 || status >= 500;
    }
  }

  // Network errors, timeouts — retryable
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("timeout") ||
           msg.includes("econnrefused") ||
           msg.includes("econnreset") ||
           msg.includes("network") ||
           msg.includes("fetch failed");
  }

  return true; // Unknown errors are retryable by default
}

function extractRetryAfter(error: unknown): number | null {
  if (error && typeof error === "object") {
    const headers = (error as Record<string, unknown>).headers;
    if (headers && typeof headers === "object") {
      const retryAfter = (headers as Record<string, unknown>)["retry-after"];
      if (typeof retryAfter === "string") {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) return seconds * 1000;
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
