import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { defineRule } from "@/lib/automation/registry";
import {
  _registerTestRules,
  dispatchEvents,
  emitEvent,
  retryDeadRun,
  RULE_JOB,
  runRuleJob,
  saveRuleSettings,
  scheduleDueRules,
} from "@/lib/automation/engine";

// Automation Engine (Phase B) against the test branch. Test rules and events use "test." names;
// everything they create is removed afterwards.
const calls: string[] = [];
let failTimes = 0;
let adminId: string;

const testRules = [
  defineRule({
    id: "test.ping",
    group: "system",
    trigger: { kind: "event", events: ["test.pinged"] },
    enabledByDefault: true,
    params: z.object({ n: z.number().int().min(1).max(5) }),
    fields: [{ key: "n", min: 1, max: 5 }],
    defaults: { n: 1 },
    run: async ({ event }) => {
      calls.push(event!.subjectId);
      return { seen: 1 };
    },
  }),
  defineRule({
    id: "test.flaky",
    group: "system",
    trigger: { kind: "event", events: ["test.flaked"] },
    enabledByDefault: true,
    params: z.object({}),
    fields: [],
    defaults: {},
    run: async () => {
      if (failTimes-- > 0) throw new Error("temporary outage");
      return { ok: true };
    },
  }),
  defineRule({
    id: "test.off",
    group: "system",
    trigger: { kind: "event", events: ["test.pinged"] },
    enabledByDefault: false,
    params: z.object({}),
    fields: [],
    defaults: {},
    run: async () => ({ ran: true }),
  }),
];

async function cleanup() {
  await prisma.job.deleteMany({ where: { type: RULE_JOB, OR: [{ dedupeKey: { startsWith: "rule:test." } }, { payload: { path: ["ruleId"], string_starts_with: "test." } }] } });
  await prisma.automationRun.deleteMany({ where: { ruleId: { startsWith: "test." } } });
  await prisma.event.deleteMany({ where: { type: { startsWith: "test." } } });
  await prisma.automationRule.deleteMany({ where: { id: { startsWith: "test." } } });
}

beforeAll(async () => {
  _registerTestRules(testRules);
  await cleanup();
  adminId = (await prisma.user.create({ data: { name: "Automation Admin", email: `auto-admin-${Date.now()}@engine.test.gobig.local`, passwordHash: "x", role: "SUPER_ADMIN" } })).id;
});
afterEach(() => {
  calls.length = 0;
});
afterAll(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { email: { endsWith: "@engine.test.gobig.local" } } });
  _registerTestRules([]);
});

const jobsFor = (ruleId: string, eventId: string) => prisma.job.findMany({ where: { type: RULE_JOB, dedupeKey: `rule:${ruleId}:event:${eventId}` } });

describe("events → rules", () => {
  it("an event committed with its change is dispatched once, and only to enabled rules", async () => {
    await prisma.$transaction((tx) => emitEvent(tx, { type: "test.pinged", subjectType: "Test", subjectId: "s1" }));
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "test.pinged", subjectId: "s1" } });
    await Promise.all([dispatchEvents(), dispatchEvents()]); // two dispatchers at once
    await dispatchEvents();
    expect(await jobsFor("test.ping", ev.id)).toHaveLength(1);
    expect(await jobsFor("test.off", ev.id)).toHaveLength(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).dispatchedAt).not.toBeNull();
  });

  it("a rolled-back change leaves no event", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await emitEvent(tx, { type: "test.pinged", subjectType: "Test", subjectId: "rolled-back" });
        throw new Error("change failed");
      }),
    ).rejects.toThrow();
    expect(await prisma.event.count({ where: { subjectId: "rolled-back" } })).toBe(0);
  });

  it("runs a rule once per event, even if the job is delivered twice", async () => {
    await emitEvent(prisma, { type: "test.pinged", subjectType: "Test", subjectId: "s2" });
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "test.pinged", subjectId: "s2" } });
    const payload = { ruleId: "test.ping", eventId: ev.id };
    await Promise.all([runRuleJob(payload, { attempts: 1 }), runRuleJob(payload, { attempts: 1 })]);
    await runRuleJob(payload, { attempts: 1 });
    expect(calls.filter((c) => c === "s2")).toHaveLength(1);
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { ruleId_subjectKey: { ruleId: "test.ping", subjectKey: `event:${ev.id}` } } });
    expect(run).toMatchObject({ status: "DONE", result: { seen: 1 } });
  });

  it("a switched-off rule records a skip instead of running", async () => {
    await emitEvent(prisma, { type: "test.pinged", subjectType: "Test", subjectId: "s3" });
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "test.pinged", subjectId: "s3" } });
    await runRuleJob({ ruleId: "test.off", eventId: ev.id }, { attempts: 1 });
    expect((await prisma.automationRun.findFirstOrThrow({ where: { ruleId: "test.off", eventId: ev.id } })).status).toBe("SKIPPED");
  });
});

describe("failures", () => {
  it("retries a failing run, marks it DEAD on the last attempt, and an admin can retry it", async () => {
    await emitEvent(prisma, { type: "test.flaked", subjectType: "Test", subjectId: "f1" });
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "test.flaked", subjectId: "f1" } });
    const payload = { ruleId: "test.flaky", eventId: ev.id };
    failTimes = 10;
    await expect(runRuleJob(payload, { attempts: 1, maxAttempts: 2 })).rejects.toThrow("temporary outage");
    const key = { ruleId_subjectKey: { ruleId: "test.flaky", subjectKey: `event:${ev.id}` } };
    expect((await prisma.automationRun.findUniqueOrThrow({ where: key })).status).toBe("FAILED");
    await expect(runRuleJob(payload, { attempts: 2, maxAttempts: 2 })).rejects.toThrow();
    const dead = await prisma.automationRun.findUniqueOrThrow({ where: key });
    expect(dead).toMatchObject({ status: "DEAD", attempts: 2, error: "temporary outage" });

    // Outage over: an admin retries; the queued job completes the run.
    failTimes = 0;
    expect(await retryDeadRun(adminId, dead.id)).toEqual({ ok: true });
    expect(await retryDeadRun(adminId, dead.id)).toEqual({ ok: false, error: "notRetryable" });
    await runRuleJob(payload, { attempts: 1, maxAttempts: 3 });
    expect((await prisma.automationRun.findUniqueOrThrow({ where: key })).status).toBe("DONE");
    expect(await prisma.auditLog.count({ where: { action: "automation.run_retried", entityId: dead.id } })).toBe(1);
  });
});

describe("schedules and settings", () => {
  it("queues each enabled schedule rule once per slot", async () => {
    const now = new Date();
    await scheduleDueRules(now);
    await scheduleDueRules(now);
    const slot = `5m:${Math.floor(now.getTime() / 300_000)}`;
    expect(await prisma.job.count({ where: { dedupeKey: `rule:driver.auto-offline:slot:${slot}` } })).toBe(1);
    await prisma.job.deleteMany({ where: { dedupeKey: { endsWith: `:slot:${slot}` } } });
  });

  it("validates settings with the rule's schema and audits changes", async () => {
    expect(await saveRuleSettings(adminId, "no.such-rule", { enabled: true, params: {} })).toEqual({ ok: false, error: "unknownRule" });
    // Test rules can't be saved through the admin path — only production rules.
    expect(await saveRuleSettings(adminId, "test.ping", { enabled: true, params: { n: 2 } })).toEqual({ ok: false, error: "unknownRule" });
    expect(await saveRuleSettings(adminId, "review.auto-hide", { enabled: true, params: { threshold: 999 } })).toEqual({ ok: false, error: "invalid" });
    const before = await prisma.automationRule.findUnique({ where: { id: "review.auto-hide" } });
    try {
      expect(await saveRuleSettings(adminId, "review.auto-hide", { enabled: true, params: { threshold: 4 } })).toEqual({ ok: true });
      expect(await prisma.automationRule.findUniqueOrThrow({ where: { id: "review.auto-hide" } })).toMatchObject({ enabled: true, params: { threshold: 4 }, updatedById: adminId });
      expect(await prisma.auditLog.count({ where: { action: "automation.rule_saved", entityId: "review.auto-hide", actorId: adminId } })).toBe(1);
    } finally {
      if (before) await prisma.automationRule.update({ where: { id: before.id }, data: { enabled: before.enabled, params: before.params as object } });
      else await prisma.automationRule.delete({ where: { id: "review.auto-hide" } });
    }
  });
});
