import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { RULE_IDS } from "./rules";

// Automation Engine, Phase I: what the admin Control Center shows. Counts, timings and error
// messages from our own code — never notification text, people's names or contact details.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ERROR_CHARS = 300;

const short = (e: string | null) => (e ? e.slice(0, ERROR_CHARS) : null);

export async function overview(now = new Date()) {
  const since = new Date(now.getTime() - DAY);
  const [runs, deadRuns, jobsDue, oldestDue, deadJobs, deliveries, openFlags] = await Promise.all([
    prisma.automationRun.groupBy({ by: ["status"], where: { updatedAt: { gte: since } }, _count: { _all: true } }),
    prisma.automationRun.count({ where: { status: "DEAD" } }),
    prisma.job.count({ where: { status: { in: ["PENDING", "RUNNING"] }, runAt: { lte: now } } }),
    prisma.job.findFirst({ where: { status: "PENDING", runAt: { lte: now } }, orderBy: { runAt: "asc" }, select: { runAt: true } }),
    prisma.job.count({ where: { status: "DEAD" } }),
    prisma.notificationDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.riskFlag.count({ where: { status: "OPEN" } }),
  ]);
  const count = <T extends { _count: { _all: number } }>(rows: T[], pick: (r: T) => string, key: string) => rows.find((r) => pick(r) === key)?._count._all ?? 0;
  return {
    runs24h: { done: count(runs, (r) => r.status, "DONE"), failed: count(runs, (r) => r.status, "FAILED") + count(runs, (r) => r.status, "DEAD"), skipped: count(runs, (r) => r.status, "SKIPPED") },
    deadRuns,
    jobsDue,
    /** Minutes the oldest due job has waited: a stuck worker shows here first. */
    queueDelayMin: oldestDue ? Math.max(0, Math.round((now.getTime() - oldestDue.runAt.getTime()) / 60_000)) : 0,
    deadJobs,
    deliveries24h: { sent: count(deliveries, (r) => r.status, "SENT"), skipped: count(deliveries, (r) => r.status, "SKIPPED"), failed: count(deliveries, (r) => r.status, "FAILED"), queued: count(deliveries, (r) => r.status, "QUEUED") },
    openFlags,
  };
}

export type RulePerformance = { ruleId: string; runs: number; failed: number; avgMs: number | null; p95Ms: number | null; lastRunAt: Date | null; lastOkAt: Date | null };

/** Per rule over `days`: how often it ran, how often it failed, how long it took. */
export async function rulePerformance(days = 7, now = new Date()): Promise<RulePerformance[]> {
  const since = new Date(now.getTime() - days * DAY);
  const rows = await prisma.$queryRaw<{ ruleId: string; runs: number; failed: number; avg: number | null; p95: number | null; last: Date | null; lastOk: Date | null }[]>`
    SELECT "ruleId",
      COUNT(*) FILTER (WHERE status <> 'SKIPPED')::int AS runs,
      COUNT(*) FILTER (WHERE status IN ('FAILED', 'DEAD'))::int AS failed,
      AVG("durationMs") FILTER (WHERE status = 'DONE')::float AS avg,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE status = 'DONE')::float AS p95,
      MAX("updatedAt") FILTER (WHERE status <> 'SKIPPED') AS last,
      MAX("updatedAt") FILTER (WHERE status = 'DONE') AS "lastOk"
    FROM "AutomationRun"
    WHERE "updatedAt" >= ${since} AND "ruleId" = ANY(${RULE_IDS})
    GROUP BY "ruleId"`;
  const byId = new Map(rows.map((r) => [r.ruleId, r]));
  return RULE_IDS.map((ruleId) => {
    const r = byId.get(ruleId);
    return {
      ruleId,
      runs: r?.runs ?? 0,
      failed: r?.failed ?? 0,
      avgMs: r?.avg == null ? null : Math.round(r.avg),
      p95Ms: r?.p95 == null ? null : Math.round(r.p95),
      lastRunAt: r?.last ?? null,
      lastOkAt: r?.lastOk ?? null,
    };
  });
}

export const RUNS_PAGE = 50;

/** Execution history, newest first, optionally for one rule or status. */
export async function runHistory(filter: { ruleId?: string | null; status?: "DONE" | "FAILED" | "DEAD" | "RUNNING" | null; page?: number }) {
  const where = {
    ...(filter.ruleId && RULE_IDS.includes(filter.ruleId) ? { ruleId: filter.ruleId } : {}),
    ...(filter.status ? { status: filter.status } : { NOT: { status: "SKIPPED" as const } }),
  };
  const page = Math.max(1, filter.page ?? 1);
  const [rows, total] = await Promise.all([
    prisma.automationRun.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * RUNS_PAGE,
      take: RUNS_PAGE,
      select: { id: true, ruleId: true, trigger: true, subjectKey: true, status: true, attempts: true, durationMs: true, result: true, error: true, updatedAt: true },
    }),
    prisma.automationRun.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, error: short(r.error) })), total, page, pages: Math.max(1, Math.ceil(total / RUNS_PAGE)) };
}

/** Background jobs that gave up after all their attempts (notifications, dispatch, clean-up…). */
export async function deadJobs(take = 50) {
  const rows = await prisma.job.findMany({ where: { status: "DEAD" }, orderBy: { updatedAt: "desc" }, take, select: { id: true, type: true, attempts: true, lastError: true, updatedAt: true } });
  return rows.map((j) => ({ ...j, lastError: short(j.lastError) }));
}

/** Admin: run a dead job again from scratch (audited). Its payload is unchanged. */
export async function retryDeadJob(actorId: string, jobId: string): Promise<{ ok: true } | { ok: false; error: "notFound" | "notRetryable" }> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { status: true, type: true } });
    if (!job) return { ok: false as const, error: "notFound" as const };
    const { count } = await tx.job.updateMany({ where: { id: jobId, status: "DEAD" }, data: { status: "PENDING", attempts: 0, runAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
    if (!count) return { ok: false as const, error: "notRetryable" as const };
    await audit(tx, { actorId, action: "automation.job_retried", entityType: "Job", entityId: jobId, metadata: { type: job.type } });
    return { ok: true as const };
  });
}

/** Push and email over `days`: sent / skipped / failed per channel, and the most common reasons. */
export async function deliveryStats(days = 7, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY);
  const [byStatus, reasons] = await Promise.all([
    prisma.notificationDelivery.groupBy({ by: ["channel", "status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.notificationDelivery.groupBy({
      by: ["channel", "reason"],
      where: { createdAt: { gte: since }, status: { in: ["SKIPPED", "FAILED"] }, reason: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { reason: "desc" } },
      take: 12,
    }),
  ]);
  const channels = (["PUSH", "EMAIL"] as const).map((channel) => {
    const get = (status: string) => byStatus.find((r) => r.channel === channel && r.status === status)?._count._all ?? 0;
    const sent = get("SENT");
    const failed = get("FAILED");
    return { channel, sent, skipped: get("SKIPPED"), failed, queued: get("QUEUED"), successRate: sent + failed ? Math.round((sent / (sent + failed)) * 100) : null };
  });
  return { channels, reasons: reasons.map((r) => ({ channel: r.channel, reason: r.reason!, count: r._count._all })) };
}

export const CONTROL_AUDIT_ACTIONS = ["automation.rule_saved", "automation.run_retried", "automation.job_retried", "review.auto_hidden", "automation.request_reminders", "automation.drivers_offline"] as const;

/** Who changed what in automation, and what the system did by itself. */
export async function automationAudit(take = 30) {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: [...CONTROL_AUDIT_ACTIONS] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, actorId: true, action: true, entityId: true, metadata: true, createdAt: true },
  });
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, actorName: r.actorId ? (names.get(r.actorId) ?? null) : null }));
}
