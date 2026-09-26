import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";

// Phase 16: a durable job queue in Postgres. No extra infrastructure is needed to start; any
// number of workers (`npm run worker`, or the cron tick route) can drain it concurrently because
// jobs are claimed with FOR UPDATE SKIP LOCKED. At much larger volume the same interface can be
// backed by a dedicated queue without touching callers.

export type JobPayload = Record<string, unknown>;
export type JobHandler = (payload: JobPayload, job: { id: string; attempts: number }) => Promise<void>;

/** A RUNNING job whose worker hasn't finished in this long is assumed crashed and reclaimed. */
export const LOCK_TIMEOUT_MS = 5 * 60_000;
const MAX_ERROR_CHARS = 500;

export async function enqueue(
  type: string,
  payload: JobPayload = {},
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
): Promise<{ id: string; created: boolean }> {
  const data = {
    type,
    payload: payload as Prisma.InputJsonValue,
    runAt: opts.runAt ?? new Date(),
    maxAttempts: opts.maxAttempts ?? 5,
    dedupeKey: opts.dedupeKey ?? null,
  };
  if (!opts.dedupeKey) {
    const job = await prisma.job.create({ data, select: { id: true } });
    return { id: job.id, created: true };
  }
  // Same key already queued or running: keep that one (idempotent enqueue).
  try {
    const job = await prisma.job.create({ data, select: { id: true } });
    return { id: job.id, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.job.findUnique({ where: { dedupeKey: opts.dedupeKey }, select: { id: true } });
      if (existing) return { id: existing.id, created: false };
    }
    throw err;
  }
}

/** Retry delay after the n-th failed attempt: 30 s, 2 min, 8 min, 32 min… capped at 6 h. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 4 ** Math.max(0, attempts - 1), 6 * 60 * 60_000);
}

type Claimed = { id: string; type: string; payload: JobPayload; attempts: number; maxAttempts: number };

/** Atomically claims up to `limit` due jobs (including stale RUNNING ones) for this worker. */
export async function claim(workerId: string, limit: number, now = new Date()): Promise<Claimed[]> {
  const stale = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  return prisma.$queryRaw<Claimed[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = ${now}, "lockedBy" = ${workerId},
      "attempts" = "attempts" + 1, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE ("status" = 'PENDING' AND "runAt" <= ${now})
         OR ("status" = 'RUNNING' AND "lockedAt" < ${stale})
      ORDER BY "runAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

/**
 * Runs due jobs once. Each job's outcome is written only if this worker still holds its lock, so
 * a slow worker whose job was reclaimed can't overwrite the newer run's result.
 */
export async function runDueJobs(
  handlers: Record<string, JobHandler>,
  opts: { workerId?: string; limit?: number; now?: Date } = {},
): Promise<{ done: number; failed: number; dead: number }> {
  const workerId = opts.workerId ?? `w-${randomUUID().slice(0, 8)}`;
  const jobs = await claim(workerId, opts.limit ?? 20, opts.now);
  const stats = { done: 0, failed: 0, dead: 0 };
  for (const job of jobs) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`no handler for job type "${job.type}"`);
      await handler(job.payload ?? {}, { id: job.id, attempts: job.attempts });
      await prisma.job.updateMany({
        where: { id: job.id, lockedBy: workerId, status: "RUNNING" },
        data: { status: "DONE", lockedAt: null, lockedBy: null, lastError: null, dedupeKey: null },
      });
      stats.done++;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_CHARS);
      const dead = job.attempts >= job.maxAttempts;
      await prisma.job.updateMany({
        where: { id: job.id, lockedBy: workerId, status: "RUNNING" },
        data: dead
          ? { status: "DEAD", lockedAt: null, lockedBy: null, lastError: message, dedupeKey: null }
          : { status: "PENDING", lockedAt: null, lockedBy: null, lastError: message, runAt: new Date(Date.now() + backoffMs(job.attempts)) },
      });
      if (dead) stats.dead++;
      else stats.failed++;
      log.warn("job failed", { jobId: job.id, type: job.type, attempts: job.attempts, dead, error: message });
    }
  }
  return stats;
}

/** Deletes finished jobs older than `days` (DEAD ones are kept longer for inspection). */
export async function pruneJobs(days = 7, now = new Date()): Promise<number> {
  const doneBefore = new Date(now.getTime() - days * 86_400_000);
  const deadBefore = new Date(now.getTime() - days * 4 * 86_400_000);
  const { count } = await prisma.job.deleteMany({
    where: { OR: [{ status: "DONE", updatedAt: { lt: doneBefore } }, { status: "DEAD", updatedAt: { lt: deadBefore } }] },
  });
  return count;
}
