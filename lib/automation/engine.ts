import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { log } from "@/lib/log";
import { slotFor, type AnyRule } from "./registry";
import { RULES } from "./rules";

// Automation Engine (Phase B): events, settings, runs.
//
//   emitEvent(tx, …)            inside the business transaction (outbox)
//   dispatchEvents()            job: each new event → one "automation:rule" job per enabled rule
//   scheduleDueRules()          every tick: each due schedule slot → one "automation:rule" job
//   runRuleJob(payload)         job: runs the rule once per (rule, subject), logs the run
//
// Idempotency is layered: job dedupe keys stop duplicate jobs; the AutomationRun unique key
// (ruleId, subjectKey) stops a second execution even if a duplicate job slipped through.

type Db = Prisma.TransactionClient | typeof prisma;
const MAX_ERROR = 500;
export const RULE_JOB = "automation:rule";
export const DISPATCH_JOB = "automation:dispatch";

// ─── Registry lookups ───────────────────────────────────────────────────────────────────────

export function ruleById(id: string): AnyRule | undefined {
  return registry().find((r) => r.id === id);
}

let extra: AnyRule[] = [];
/** Tests register throwaway rules here; production rules live in rules.ts. */
export function _registerTestRules(rules: AnyRule[]) {
  extra = rules;
}
export function registry(): AnyRule[] {
  return [...RULES, ...extra];
}

// ─── Settings ───────────────────────────────────────────────────────────────────────────────

export type RuleSettings = { enabled: boolean; params: Record<string, unknown> };

/** A rule's saved settings, or its defaults. Saved params that no longer validate fall back to defaults. */
export async function getRuleSettings(rule: AnyRule, db: Db = prisma): Promise<RuleSettings> {
  const row = await db.automationRule.findUnique({ where: { id: rule.id } });
  if (!row) return { enabled: rule.enabledByDefault, params: rule.defaults };
  const parsed = rule.params.safeParse({ ...rule.defaults, ...(row.params as object) });
  return { enabled: row.enabled, params: parsed.success ? parsed.data : rule.defaults };
}

export async function allRuleSettings(): Promise<Map<string, RuleSettings>> {
  const rows = await prisma.automationRule.findMany();
  return new Map(
    registry().map((rule) => {
      const row = rows.find((r) => r.id === rule.id);
      if (!row) return [rule.id, { enabled: rule.enabledByDefault, params: rule.defaults }];
      const parsed = rule.params.safeParse({ ...rule.defaults, ...(row.params as object) });
      return [rule.id, { enabled: row.enabled, params: parsed.success ? parsed.data : rule.defaults }];
    }),
  );
}

/** Admin change: validated with the rule's own schema, audited with before/after. */
export async function saveRuleSettings(actorId: string, ruleId: string, input: { enabled: boolean; params: unknown }): Promise<{ ok: true } | { ok: false; error: "unknownRule" | "invalid" }> {
  const rule = ruleById(ruleId);
  if (!rule || !RULES.includes(rule)) return { ok: false, error: "unknownRule" };
  const parsed = rule.params.safeParse(input.params);
  if (!parsed.success || typeof input.enabled !== "boolean") return { ok: false, error: "invalid" };
  await prisma.$transaction(async (tx) => {
    const before = await getRuleSettings(rule, tx);
    await tx.automationRule.upsert({
      where: { id: rule.id },
      create: { id: rule.id, enabled: input.enabled, params: parsed.data as Prisma.InputJsonValue, updatedById: actorId },
      update: { enabled: input.enabled, params: parsed.data as Prisma.InputJsonValue, updatedById: actorId },
    });
    await audit(tx, {
      actorId,
      action: "automation.rule_saved",
      entityType: "AutomationRule",
      entityId: rule.id,
      metadata: { before: before as unknown as Prisma.InputJsonValue, after: { enabled: input.enabled, params: parsed.data } as Prisma.InputJsonValue },
    });
  });
  return { ok: true };
}

// ─── Events (outbox) ────────────────────────────────────────────────────────────────────────

export type NewEvent = { type: string; subjectType: string; subjectId: string; payload?: Record<string, string | number | boolean | null> };

/** Call inside the transaction that makes the change. Payload: ids and small facts only. */
export async function emitEvent(db: Db, e: NewEvent): Promise<void> {
  await db.event.create({ data: { type: e.type, subjectType: e.subjectType, subjectId: e.subjectId, payload: (e.payload ?? {}) as Prisma.InputJsonValue } });
}

/**
 * Claims undispatched events (SKIP LOCKED, so several dispatchers never share one) and, in the same
 * transaction, queues one job per enabled rule listening to each event type.
 */
export async function dispatchEvents(limit = 200, now = new Date()): Promise<{ events: number; jobs: number }> {
  const settings = await allRuleSettings();
  return prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<{ id: string; type: string }[]>`
      SELECT "id", "type" FROM "Event" WHERE "dispatchedAt" IS NULL
      ORDER BY "occurredAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
    if (!events.length) return { events: 0, jobs: 0 };
    const jobs = events.flatMap((ev) =>
      registry()
        .filter((r) => r.trigger.kind === "event" && r.trigger.events.includes(ev.type) && settings.get(r.id)?.enabled)
        .map((r) => ({ type: RULE_JOB, payload: { ruleId: r.id, eventId: ev.id }, dedupeKey: `rule:${r.id}:event:${ev.id}`, runAt: now, maxAttempts: 5 })),
    );
    if (jobs.length) await tx.job.createMany({ data: jobs, skipDuplicates: true });
    await tx.event.updateMany({ where: { id: { in: events.map((e) => e.id) } }, data: { dispatchedAt: now } });
    return { events: events.length, jobs: jobs.length };
  });
}

// ─── Schedules ──────────────────────────────────────────────────────────────────────────────

/** Queues each enabled schedule rule once for its current slot (Dar es Salaam time). */
export async function scheduleDueRules(now = new Date()): Promise<number> {
  const settings = await allRuleSettings();
  const jobs = registry().flatMap((r) => {
    if (r.trigger.kind !== "schedule" || !settings.get(r.id)?.enabled) return [];
    const slot = slotFor(r.trigger.every, now);
    return slot ? [{ type: RULE_JOB, payload: { ruleId: r.id, slot }, dedupeKey: `rule:${r.id}:slot:${slot}`, runAt: now, maxAttempts: 3 }] : [];
  });
  if (!jobs.length) return 0;
  const { count } = await prisma.job.createMany({ data: jobs, skipDuplicates: true });
  return count;
}

// ─── Running a rule ─────────────────────────────────────────────────────────────────────────

/**
 * Job handler for one rule execution. Records the run; a finished run for the same subject is
 * never repeated. On error the run is FAILED and the error rethrown so the queue retries with
 * backoff; on the job's last attempt it becomes DEAD (shown in the Control Center, retryable).
 */
export async function runRuleJob(payload: Record<string, unknown>, job: { attempts: number; maxAttempts?: number }, now = new Date()): Promise<void> {
  const rule = ruleById(String(payload.ruleId));
  if (!rule) return; // rule removed since the job was queued: nothing to do
  const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
  const subjectKey = eventId ? `event:${eventId}` : `slot:${String(payload.slot)}`;
  const trigger = eventId ? "event" : "schedule";

  // Claim the run: create it, or take over a FAILED/stale one. DONE/SKIPPED/DEAD runs are final.
  const existing = await prisma.automationRun.findUnique({ where: { ruleId_subjectKey: { ruleId: rule.id, subjectKey } } });
  if (existing && existing.status !== "FAILED" && existing.status !== "RUNNING") return;
  let runId: string;
  if (existing) {
    const { count } = await prisma.automationRun.updateMany({ where: { id: existing.id, status: existing.status, attempts: existing.attempts }, data: { status: "RUNNING", attempts: { increment: 1 }, error: null } });
    if (!count) return; // someone else took it
    runId = existing.id;
  } else {
    try {
      runId = (await prisma.automationRun.create({ data: { ruleId: rule.id, subjectKey, trigger, eventId } })).id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // a parallel run won
      throw err;
    }
  }

  const started = Date.now();
  const settings = await getRuleSettings(rule);
  if (!settings.enabled) {
    await prisma.automationRun.update({ where: { id: runId }, data: { status: "SKIPPED", result: { reason: "disabled" }, durationMs: 0 } });
    return;
  }
  let event: { id: string; type: string; subjectType: string; subjectId: string; payload: Record<string, unknown> } | undefined;
  if (eventId) {
    const row = await prisma.event.findUnique({ where: { id: eventId } });
    if (!row) {
      await prisma.automationRun.update({ where: { id: runId }, data: { status: "SKIPPED", result: { reason: "eventGone" }, durationMs: 0 } });
      return;
    }
    event = { id: row.id, type: row.type, subjectType: row.subjectType, subjectId: row.subjectId, payload: (row.payload ?? {}) as Record<string, unknown> };
  }

  try {
    const result = await rule.run({ params: settings.params, now, event });
    await prisma.automationRun.update({ where: { id: runId }, data: { status: "DONE", result: result as Prisma.InputJsonValue, durationMs: Date.now() - started } });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR);
    const dead = job.attempts >= (job.maxAttempts ?? 3);
    await prisma.automationRun.update({ where: { id: runId }, data: { status: dead ? "DEAD" : "FAILED", error: message, durationMs: Date.now() - started } });
    log.warn("automation rule failed", { ruleId: rule.id, subjectKey, attempt: job.attempts, dead, error: message });
    throw err;
  }
}

/** Housekeeping: finished runs and dispatched events are kept for a while, then removed. */
export async function pruneAutomation(now = new Date()): Promise<void> {
  await prisma.automationRun.deleteMany({ where: { status: { in: ["DONE", "SKIPPED"] }, updatedAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } });
  await prisma.automationRun.deleteMany({ where: { status: "DEAD", updatedAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } } });
  await prisma.event.deleteMany({ where: { dispatchedAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } });
}

/** Admin: put a permanently failed run back in the queue (audited). */
export async function retryDeadRun(actorId: string, runId: string): Promise<{ ok: true } | { ok: false; error: "notFound" | "notRetryable" }> {
  const run = await prisma.automationRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "notFound" };
  if (run.status !== "DEAD") return { ok: false, error: "notRetryable" };
  const payload = run.eventId ? { ruleId: run.ruleId, eventId: run.eventId } : { ruleId: run.ruleId, slot: run.subjectKey.replace(/^slot:/, "") };
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.automationRun.updateMany({ where: { id: run.id, status: "DEAD" }, data: { status: "FAILED" } });
    if (!count) return;
    await tx.job.create({ data: { type: RULE_JOB, payload, maxAttempts: 3 } });
    await audit(tx, { actorId, action: "automation.run_retried", entityType: "AutomationRun", entityId: run.id, metadata: { ruleId: run.ruleId } });
  });
  return { ok: true };
}

export { claimOnce } from "./once";
