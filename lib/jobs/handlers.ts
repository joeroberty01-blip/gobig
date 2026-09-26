import { prisma } from "@/lib/db";
import { enqueue, pruneJobs, runDueJobs, type JobHandler } from "./queue";
import { expireTrip, purgeOldTrips, redispatch } from "@/lib/services/trips";

// Phase 16: every job type the worker understands. Feature phases add theirs here.
export const handlers: Record<string, JobHandler> = {
  /** Hourly housekeeping: finished jobs and long-expired rate-limit windows. */
  maintenance: async () => {
    await pruneJobs();
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '2 days'`;
    await purgeOldTrips();
  },
  // Phase 17
  "trip:expire": async (p) => void (await expireTrip(String(p.tripId))),
  "trip:redispatch": async (p) => redispatch(String(p.tripId), Number(p.round) || 1),
};

/** One pass: schedule this hour's housekeeping (once, whoever ticks first), then drain due jobs. */
export async function tick(opts: { workerId?: string; limit?: number } = {}) {
  const hour = new Date().toISOString().slice(0, 13);
  await enqueue("maintenance", {}, { dedupeKey: `maintenance:${hour}`, maxAttempts: 3 });
  return runDueJobs(handlers, opts);
}
