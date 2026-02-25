import { resolve } from "node:path";

export interface AlmaConfig {
  port: number;
  dataDir: string;
  env: "development" | "production";

  whatsapp: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken: string;
    appSecret: string;
  };

  llm: {
    geminiApiKey: string;
    openrouterApiKey?: string;
  };

  google: {
    serviceAccountKeyPath: string;
    calendarId: string;
  };

  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
}

export function loadConfig(): AlmaConfig {
  const env = (process.env.NODE_ENV ?? "development") as AlmaConfig["env"];

  return {
    port: Number(process.env.ALMA_PORT ?? 18790),
    dataDir: resolve(process.env.ALMA_DATA_DIR ?? "./data"),
    env,

    whatsapp: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
      appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    },

    llm: {
      geminiApiKey: process.env.GEMINI_API_KEY ?? "",
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
    },

    google: {
      serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? "",
      calendarId: process.env.GOOGLE_CALENDAR_ID ?? "",
    },

    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    },
  };
}
