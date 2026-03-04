import { resolve } from "node:path";

const REQUIRED_ENV_VARS = [
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "GEMINI_API_KEY",
] as const;

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
    clientId: string;
    clientSecret: string;
  };

  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
}

export function loadConfig(): AlmaConfig {
  const env = (process.env.NODE_ENV ?? "development") as AlmaConfig["env"];

  // Validate required env vars in production
  if (env === "production") {
    const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
  }

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
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },

    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    },
  };
}
