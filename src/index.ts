/**
 * Alma — AI Home & Life Manager
 * Entry point: initializes OpenClaw instance with Alma modules.
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

async function main() {
  const config = loadConfig();

  // Initialize master database (users, billing, referrals)
  const masterDb = initMasterDb(config.dataDir);

  // Initialize services
  const llm = new LLMService(config);
  const users = new UserService(masterDb, config);
  const calendar = new CalendarService(config);
  const tasks = new TaskService(users);
  const billing = new BillingService(config, masterDb);
  const maintenance = new MaintenanceService();
  const capture = new CaptureService(llm, tasks, calendar);
  const briefing = new BriefingService(llm, calendar, tasks, users, maintenance);
  const nudge = new NudgeService(llm, users, tasks);

  // Initialize WhatsApp router (handles incoming messages)
  const router = new WhatsAppRouter(config, {
    llm,
    users,
    capture,
    briefing,
    nudge,
    calendar,
    tasks,
    billing,
  });

  await router.start();
  console.log(`Alma running on port ${config.port}`);
}

main().catch((err) => {
  console.error("Alma failed to start:", err);
  process.exit(1);
});
