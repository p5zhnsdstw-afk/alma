/**
 * ADR-003: WhatsApp API Abstraction
 * Core logic never imports Meta-specific types.
 * Implementations: CloudAPIProvider (production), BaileysDevProvider (local dev).
 */

export interface IncomingMessage {
  id: string;
  from: string; // phone number
  timestamp: Date;
  type: "text" | "audio" | "image" | "location" | "interactive";
  text?: string;
  audioUrl?: string;
  caption?: string;
}

export interface OutgoingMessage {
  to: string;
  text: string;
  replyTo?: string; // message ID to quote
}

export interface MessageProvider {
  /** Send a text message */
  send(msg: OutgoingMessage): Promise<string>; // returns message ID

  /** Mark message as read */
  markRead(messageId: string): Promise<void>;

  /** Register webhook handler for incoming messages */
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;

  /** Start listening (webhook server or socket connection) */
  start(port: number): Promise<void>;

  /** Graceful shutdown */
  stop(): Promise<void>;
}
