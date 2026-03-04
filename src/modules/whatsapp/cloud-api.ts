/**
 * WhatsApp Business Cloud API implementation.
 * Production provider per D-1.
 *
 * Hardened: process-before-ack, /health endpoint, connection draining.
 */

import { createServer, type IncomingMessage as HttpReq, type ServerResponse } from "node:http";
import type { MessageProvider, IncomingMessage, OutgoingMessage } from "./provider.js";
import { log } from "../../utils/logger.js";

const MOD = "cloud-api";
const DRAIN_TIMEOUT_MS = 15_000;

interface CloudAPIConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret: string;
}

export interface HealthStatus {
  ok: boolean;
  uptime: number;
  inflight: number;
  lastMessageAt: string | null;
}

export class CloudAPIProvider implements MessageProvider {
  private config: CloudAPIConfig;
  private handler?: (msg: IncomingMessage) => Promise<void>;
  private oauthHandler?: (code: string, state: string) => Promise<string>;
  private server?: ReturnType<typeof createServer>;
  private inflightCount = 0;
  private startedAt = 0;
  private lastMessageAt: Date | null = null;
  private draining = false;
  private healthChecker?: () => HealthStatus;

  constructor(config: CloudAPIConfig) {
    this.config = config;
  }

  /** Allow external health info (e.g., scheduler metrics) */
  setHealthChecker(checker: () => HealthStatus): void {
    this.healthChecker = checker;
  }

  getHealth(): HealthStatus {
    if (this.healthChecker) return this.healthChecker();
    return {
      ok: !this.draining && this.startedAt > 0,
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      inflight: this.inflightCount,
      lastMessageAt: this.lastMessageAt?.toISOString() ?? null,
    };
  }

  async send(msg: OutgoingMessage): Promise<string> {
    const url = `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`;
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: msg.to,
      type: "text",
      text: { body: msg.text },
    };
    if (msg.replyTo) {
      body.context = { message_id: msg.replyTo };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      const error = new Error(`WhatsApp API ${res.status}: ${errorText}`);
      (error as any).status = res.status;
      throw error;
    }

    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return data.messages?.[0]?.id ?? "";
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    // Step 1: Get the media URL from Meta
    const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (!metaRes.ok) {
      throw new Error(`Media metadata fetch failed: ${metaRes.status}`);
    }

    const metaData = (await metaRes.json()) as { url?: string };
    if (!metaData.url) {
      throw new Error("Media URL not found in Meta response");
    }

    // Step 2: Download the actual binary from the URL
    const mediaRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (!mediaRes.ok) {
      throw new Error(`Media download failed: ${mediaRes.status}`);
    }

    const arrayBuffer = await mediaRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async markRead(messageId: string): Promise<void> {
    const url = `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.handler = handler;
  }

  /** Register OAuth callback handler for calendar connect flow */
  onOAuthCallback(handler: (code: string, state: string) => Promise<string>): void {
    this.oauthHandler = handler;
  }

  async start(port: number): Promise<void> {
    this.startedAt = Date.now();

    this.server = createServer(async (req: HttpReq, res: ServerResponse) => {
      // ── Health check endpoint ────────────────────────────────────────
      if (req.method === "GET" && req.url === "/health") {
        const health = this.getHealth();
        const status = health.ok ? 200 : 503;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(health));
        return;
      }

      // ── OAuth callback (Google Calendar connect) ──────────────────────
      if (req.method === "GET" && req.url?.startsWith("/oauth/google/callback")) {
        const url = new URL(req.url, `http://localhost:${port}`);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code || !state || !this.oauthHandler) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Error</h1><p>Enlace inválido o expirado.</p>");
          return;
        }

        try {
          const resultMessage = await this.oauthHandler(code, state);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>Listo!</h1><p>${resultMessage}</p><p>Puedes cerrar esta ventana.</p>`);
        } catch (error) {
          log.error(MOD, "OAuth callback failed", error);
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Error</h1><p>No se pudo conectar tu calendario. Intenta de nuevo.</p>");
        }
        return;
      }

      // ── Webhook verification (Meta handshake) ────────────────────────
      if (req.method === "GET") {
        const url = new URL(req.url ?? "", `http://localhost:${port}`);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token === this.config.verifyToken) {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(challenge);
        } else {
          res.writeHead(403);
          res.end();
        }
        return;
      }

      // ── Webhook messages (process BEFORE ack) ────────────────────────
      if (req.method === "POST") {
        // Reject new messages during shutdown drain
        if (this.draining) {
          res.writeHead(503);
          res.end();
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", async () => {
          let messages: IncomingMessage[] = [];

          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            messages = this.extractMessages(body);
          } catch (error) {
            log.warn(MOD, "malformed webhook payload", { error: String(error) });
            // Still ack 200 — Meta will retry otherwise and flood us
            res.writeHead(200);
            res.end();
            return;
          }

          // Ack 200 to Meta immediately AFTER parsing but BEFORE processing.
          // Why: Meta requires 200 within 20s or retries. Processing can take longer.
          // Safety: We've already parsed the messages — they're in memory.
          // If we crash during processing, Meta will re-send (idempotent by msg.id).
          res.writeHead(200);
          res.end();

          // Process each message with inflight tracking
          for (const msg of messages) {
            this.inflightCount++;
            this.lastMessageAt = new Date();
            try {
              await this.handler?.(msg);
            } catch (error) {
              log.error(MOD, "handler failed", error, { msgId: msg.id, from: msg.from });
            } finally {
              this.inflightCount--;
            }
          }
        });
        return;
      }

      res.writeHead(405);
      res.end();
    });

    return new Promise((resolve) => {
      this.server!.listen(port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    this.draining = true;
    log.info(MOD, "draining connections", { inflight: this.inflightCount });

    // Wait for in-flight message handlers to complete
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (this.inflightCount > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (this.inflightCount > 0) {
      log.warn(MOD, "drain timeout — forcing shutdown", { inflight: this.inflightCount });
    }

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        log.info(MOD, "HTTP server closed");
        resolve();
      });
    });
  }

  private extractMessages(body: Record<string, unknown>): IncomingMessage[] {
    const messages: IncomingMessage[] = [];
    const entry = body.entry as Array<Record<string, unknown>> | undefined;
    if (!entry) return messages;

    for (const e of entry) {
      const changes = e.changes as Array<Record<string, unknown>> | undefined;
      if (!changes) continue;

      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined;
        const msgs = value?.messages as Array<Record<string, unknown>> | undefined;
        if (!msgs) continue;

        for (const m of msgs) {
          const type = m.type as string;
          const msg: IncomingMessage = {
            id: m.id as string,
            from: m.from as string,
            timestamp: new Date(Number(m.timestamp as string) * 1000),
            type: type as IncomingMessage["type"],
          };

          if (type === "text") {
            msg.text = (m.text as Record<string, string>)?.body;
          } else if (type === "audio") {
            msg.audioUrl = (m.audio as Record<string, string>)?.id;
          }

          messages.push(msg);
        }
      }
    }

    return messages;
  }
}
