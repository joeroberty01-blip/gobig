import { prisma } from "@/lib/db";
import { enqueue, pruneJobs, runDueJobs, type JobHandler } from "./queue";
import { expireTrip, purgeOldTrips, redispatch } from "@/lib/services/trips";
import { dispatchEvents, pruneAutomation, RULE_JOB, runRuleJob, scheduleDueRules } from "@/lib/automation/engine";
import { log } from "@/lib/log";

// Phase 16: every job type the worker understands. Feature phases add theirs here.
export const handlers: Record<string, JobHandler> = {
  /** Hourly housekeeping: finished jobs, long-expired rate-limit windows, old trips and runs. */
  maintenance: async () => {
    await pruneJobs();
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '2 days'`;
    await purgeOldTrips();
    await pruneAutomation();
  },
  // Automation Engine (Phase B): one rule execution (event- or schedule-triggered).
  [RULE_JOB]: (payload, job) => runRuleJob(payload, job),
  /** Phase 17's single "automation" job, replaced by the engine; jobs already queued finish quietly. */
  automation: async () => undefined,
  "trip:expire": async (p) => void (await expireTrip(String(p.tripId))),
  "trip:redispatch": async (p) => redispatch(String(p.tripId), Number(p.round) || 1),
};

/**
 * One pass: queue this hour's housekeeping, turn new events and due schedule slots into rule jobs
 * (each exactly once, whoever ticks first), then drain due jobs.
 */
export async function tick(opts: { workerId?: string; limit?: number; types?: string[] } = {}) {
  const hour = new Date().toISOString().slice(0, 13);
  await enqueue("maintenance", {}, { dedupeKey: `maintenance:${hour}`, maxAttempts: 3 });
  // A worker dedicated to other job types leaves automation scheduling to the others.
  if (!opts.types?.length || opts.types.includes(RULE_JOB)) {
    try {
      await dispatchEvents();
      await scheduleDueRules();
    } catch (err) {
      log.warn("automation scheduling failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return runDueJobs(handlers, opts);
}
