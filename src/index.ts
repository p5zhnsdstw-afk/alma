/**
 * Alma — AI Home & Life Manager
 * Entry point: initializes services, validates startup, wires dependencies, starts scheduler.
 */

import { loadConfig } from "./config.js";
import { initMasterDb } from "./db/master.js";
import { WhatsAppRouter } from "./modules/whatsapp/index.js";
import { LLMService } from "./modules/llm/index.js";
import { BriefingService } from "./modules/briefing/index.js";
import { CaptureService } from "./modules/capture/index.js";
import { NudgeService } from "./modules/nudge/index.js";
import { CalendarService } from "./modules/calendar/index.js";
import { TaskService } from "./modules/tasks/index.js";
import { BillingService } from "./modules/billing/index.js";
import { UserService } from "./modules/users/index.js";
import { MaintenanceService } from "./modules/maintenance/index.js";
import { DeliveryService } from "./modules/delivery/index.js";
import { startDeliveryScheduler } from "./modules/delivery/scheduler.js";
import { closeAllFamilyDbs } from "./db/family.js";
import { log } from "./utils/logger.js";

async function main() {
  const startTime = Date.now();
  log.info("main", "Alma starting...");

  // ── Load and validate config ─────────────────────────────────────────
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    log.error("main", "Invalid configuration", error);
    process.exit(1);
  }

  // ── Initialize master database ───────────────────────────────────────
  let masterDb;
  try {
    masterDb = initMasterDb(config.dataDir);
    // Validate DB is accessible
    masterDb.prepare("SELECT 1").get();
    log.info("main", "Master database initialized", { dataDir: config.dataDir });
  } catch (error) {
    log.error("main", "Master database initialization failed", error);
    process.exit(1);
  }

  // ── Initialize services ──────────────────────────────────────────────
  const llm = new LLMService(config);
  const users = new UserService(masterDb, config);
  users.setLLM(llm);
  const calendar = new CalendarService(config);
  const tasks = new TaskService(users);
  const billing = new BillingService(config, masterDb);
  const maintenance = new MaintenanceService();
  const delivery = new DeliveryService(llm, users);
  const capture = new CaptureService(llm, tasks, calendar);
  capture.setDeliveryService(delivery);
  const briefing = new BriefingService(calendar, tasks, users, maintenance, delivery);
  const nudge = new NudgeService(llm, users, tasks);

  log.info("main", "All services initialized");

  // ── Start WhatsApp router ────────────────────────────────────────────
  const router = new WhatsAppRouter(config, {
    llm, users, capture, briefing, nudge, calendar, tasks, billing, delivery,
  });

  // Wire provider to capture service for media downloads (voice notes)
  capture.setProvider(router.getProvider());

  // Wire Google OAuth callback for calendar connect
  const redirectUri = `http://localhost:${config.port}/oauth/google/callback`;
  const googleAdapter = calendar.getGoogleAdapter();
  users.setCalendarHelpers({
    getGoogleAuthUrl: (userId: string) => googleAdapter.getAuthUrl(redirectUri, userId),
  });
  router.setOAuthCallback(async (code: string, state: string) => {
    const userId = state;
    const user = await users.getUser(userId);
    if (!user) throw new Error("User not found");

    const { refreshToken, calendarId } = await googleAdapter.exchangeCode(code, redirectUri);
    users.storeCalendarToken(userId, refreshToken, calendarId);

    // Notify user via WhatsApp
    const msg = "Google Calendar conectado. Tus eventos ya están sincronizados.";
    await router.getProvider().send({ to: user.phone, text: msg });
    return msg;
  });

  try {
    await router.start();
    log.info("main", "WhatsApp router started", { port: config.port });
  } catch (error) {
    log.error("main", "WhatsApp router failed to start", error);
    process.exit(1);
  }

  // ── Start delivery scheduler ─────────────────────────────────────────
  const scheduler = startDeliveryScheduler(users, delivery, router.getProvider(), masterDb);

  const elapsed = Date.now() - startTime;
  log.info("main", `Alma ready in ${elapsed}ms`, { port: config.port });

  // ── Graceful shutdown ────────────────────────────────────────────────
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info("main", `Shutdown signal received: ${signal}`);

    // Stop scheduler first (no new deliveries)
    scheduler.stop();

    // Drain in-flight connections (provider handles its own timeout)
    try {
      await router.getProvider().stop();
      log.info("main", "Provider stopped — connections drained");
    } catch (error) {
      log.error("main", "Provider stop failed", error);
    }

    // Close all family databases with WAL checkpoint
    try {
      const closed = closeAllFamilyDbs();
      log.info("main", "Family databases closed", { count: closed });
    } catch (error) {
      log.error("main", "Family DB close failed", error);
    }

    // Close master DB with WAL checkpoint
    try {
      masterDb.pragma("wal_checkpoint(RESTART)");
      masterDb.close();
      log.info("main", "Master database closed");
    } catch (error) {
      log.error("main", "Master DB close failed", error);
    }

    const metrics = scheduler.getMetrics();
    log.info("main", "Alma shutdown complete", {
      totalTicks: metrics.totalTicks,
      deliveriesSent: metrics.deliveriesSent,
      recoveredDeliveries: metrics.recoveredDeliveries,
      errors: metrics.errors,
    });
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error("main", "Alma failed to start", err);
  process.exit(1);
});
