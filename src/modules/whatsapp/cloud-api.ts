/**
 * WhatsApp Business Cloud API implementation.
 * Production provider per D-1.
 */

import { createServer, type IncomingMessage as HttpReq, type ServerResponse } from "node:http";
import type { MessageProvider, IncomingMessage, OutgoingMessage } from "./provider.js";

interface CloudAPIConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret: string;
}

export class CloudAPIProvider implements MessageProvider {
  private config: CloudAPIConfig;
  private handler?: (msg: IncomingMessage) => Promise<void>;
  private server?: ReturnType<typeof createServer>;

  constructor(config: CloudAPIConfig) {
    this.config = config;
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

    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return data.messages?.[0]?.id ?? "";
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

  async start(port: number): Promise<void> {
    this.server = createServer(async (req: HttpReq, res: ServerResponse) => {
      if (req.method === "GET") {
        // Webhook verification
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

      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", async () => {
          res.writeHead(200);
          res.end();

          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const messages = this.extractMessages(body);
            for (const msg of messages) {
              await this.handler?.(msg);
            }
          } catch {
            // Silently drop malformed webhooks
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
    return new Promise((resolve) => {
      this.server?.close(() => resolve());
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
