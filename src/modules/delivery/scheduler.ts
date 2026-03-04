/**
 * Delivery scheduler — runs every 60s to process scheduled deliveries,
 * follow-ups, and expirations across all families.
 *
 * D-22: In-process scheduler (not cron) for precise timing.
 * Hardened: concurrent tick protection, error logging, metrics.
 */

import type Database from "better-sqlite3";
import type { DeliveryService } from "./index.js";
import type { UserService } from "../users/index.js";
import type { MessageProvider } from "../whatsapp/provider.js";
import { log } from "../../utils/logger.js";

const SCHEDULER_INTERVAL_MS = 60_000; // every 60 seconds
const STUCK_DELIVERING_THRESHOLD_MS = 5 * 60_000; // 5 minutes
const MOD = "scheduler";

interface SchedulerMetrics {
  lastTickAt: Date | null;
  familiesProcessed: number;
  deliveriesSent: number;
  followupsSent: number;
  expirationsProcessed: number;
  recoveredDeliveries: number;
  errors: number;
  totalTicks: number;
}

/**
 * Start the delivery scheduler. Returns a handle to stop it.
 */
export function startDeliveryScheduler(
  users: UserService,
  delivery: DeliveryService,
  provider: MessageProvider,
  masterDb: Database.Database,
): { stop: () => void; getMetrics: () => SchedulerMetrics } {
  let running = false;
  const metrics: SchedulerMetrics = {
    lastTickAt: null,
    familiesProcessed: 0,
    deliveriesSent: 0,
    followupsSent: 0,
    expirationsProcessed: 0,
    recoveredDeliveries: 0,
    errors: 0,
    totalTicks: 0,
  };

  const tick = async () => {
    if (running) {
      log.warn(MOD, "tick skipped — previous tick still running");
      return;
    }

    running = true;
    const start = Date.now();

    try {
      const result = await processAllFamilies(users, delivery, provider, masterDb);
      metrics.familiesProcessed += result.familiesProcessed;
      metrics.deliveriesSent += result.sent;
      metrics.followupsSent += result.followups;
      metrics.expirationsProcessed += result.expirations;
      metrics.recoveredDeliveries += result.recovered;
      metrics.errors += result.errors;
      metrics.totalTicks++;
      metrics.lastTickAt = new Date();

      const elapsed = Date.now() - start;
      if (result.sent > 0 || result.followups > 0 || result.expirations > 0 || result.recovered > 0) {
        log.info(MOD, "tick complete", {
          elapsed,
          families: result.familiesProcessed,
          sent: result.sent,
          followups: result.followups,
          expirations: result.expirations,
          recovered: result.recovered,
          errors: result.errors,
        });
      }
    } catch (error) {
      metrics.errors++;
      metrics.totalTicks++;
      log.error(MOD, "tick failed", error);
    } finally {
      running = false;
    }
  };

  // Run immediately on start, then every interval
  tick();
  const interval = setInterval(tick, SCHEDULER_INTERVAL_MS);

  log.info(MOD, "delivery scheduler started", { intervalMs: SCHEDULER_INTERVAL_MS });

  return {
    stop() {
      clearInterval(interval);
      log.info(MOD, "delivery scheduler stopped", {
        totalTicks: metrics.totalTicks,
        totalSent: metrics.deliveriesSent,
      });
    },
    getMetrics() {
      return { ...metrics };
    },
  };
}

interface TickResult {
  familiesProcessed: number;
  sent: number;
  followups: number;
  expirations: number;
  recovered: number;
  errors: number;
}

async function processAllFamilies(
  users: UserService,
  delivery: DeliveryService,
  provider: MessageProvider,
  masterDb: Database.Database,
): Promise<TickResult> {
  const result: TickResult = { familiesProcessed: 0, sent: 0, followups: 0, expirations: 0, recovered: 0, errors: 0 };

  const families = masterDb
    .prepare("SELECT id FROM families")
    .all() as Array<{ id: string }>;

  for (const { id: familyId } of families) {
    try {
      const familyDb = users.getFamilyDb(familyId);

      // Quick check: any active deliveries?
      const activeCount = (
        familyDb
          .prepare(
            `SELECT COUNT(*) as cnt FROM deliveries
             WHERE status IN ('scheduled', 'delivered', 'delivering', 'pending')`,
          )
          .get() as { cnt: number }
      ).cnt;

      if (activeCount === 0) continue;

      result.familiesProcessed++;

      // Recover deliveries stuck in 'delivering' state (crash recovery)
      result.recovered += recoverStuckDeliveries(familyDb);

      result.sent += await delivery.processScheduledDeliveries(familyId, familyDb, provider);
      result.followups += await delivery.processFollowups(familyDb, provider);
      result.expirations += await delivery.processExpirations(familyDb, provider);
    } catch (error) {
      result.errors++;
      log.error(MOD, "family processing failed", error, { familyId });
    }
  }

  return result;
}

/**
 * Recover deliveries stuck in 'delivering' state after a crash.
 * If a delivery has been 'delivering' for longer than the threshold,
 * reset it to 'scheduled' so the next tick will retry.
 */
function recoverStuckDeliveries(familyDb: Database.Database): number {
  try {
    const thresholdMs = STUCK_DELIVERING_THRESHOLD_MS;
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();

    const result = familyDb
      .prepare(
        `UPDATE deliveries SET status = 'scheduled'
         WHERE status = 'delivering' AND updated_at < ?`,
      )
      .run(cutoff);

    if (result.changes > 0) {
      log.warn(MOD, "recovered stuck deliveries", { count: result.changes });
    }

    return result.changes;
  } catch (error) {
    log.error(MOD, "recoverStuckDeliveries failed", error);
    return 0;
  }
}
