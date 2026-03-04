/**
 * Structured JSON logger for Alma.
 *
 * Lightweight, zero-dependency. Every log entry is a single JSON line
 * with module tag, level, timestamp, and optional structured data.
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  mod: string;
  msg: string;
  data?: Record<string, unknown>;
  err?: { message: string; stack?: string };
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function extractError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function write(level: LogLevel, mod: string, msg: string, error?: unknown, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    mod,
    msg,
  };

  if (data && Object.keys(data).length > 0) {
    entry.data = data;
  }

  if (error !== undefined) {
    entry.err = extractError(error);
  }

  const line = formatEntry(entry);

  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  info(mod: string, msg: string, data?: Record<string, unknown>): void {
    write("info", mod, msg, undefined, data);
  },

  warn(mod: string, msg: string, data?: Record<string, unknown>): void {
    write("warn", mod, msg, undefined, data);
  },

  error(mod: string, msg: string, error: unknown, data?: Record<string, unknown>): void {
    write("error", mod, msg, error, data);
  },
} as const;
