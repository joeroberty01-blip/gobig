import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { automationAudit, deadJobs, deliveryStats, overview, retryDeadJob, rulePerformance, runHistory } from "@/lib/automation/control";
import { RULE_IDS } from "@/lib/automation/rules";

// Automation Engine, Phase I: the admin Control Center's numbers, on the test branch.
const run = `i${Date.now().toString(36)}`;
const domain = ".center.test.gobig.local";
const JOB_TYPE = `test:center-${run}`;
const RULE = "trust.spam";
let adminId: string;
let jobId: string;

async function cleanup() {
  await prisma.job.deleteMany({ where: { type: JOB_TYPE } });
  await prisma.automationRun.deleteMany({ where: { subjectKey: { startsWith: `slot:${run}` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  adminId = (await prisma.user.create({ data: { name: "Center Admin", email: `admin-${run}${domain}`, passwordHash: "x", role: "ADMIN" } })).id;
  await prisma.automationRun.createMany({
    data: [
      { ruleId: RULE, subjectKey: `slot:${run}:1`, trigger: "schedule", status: "DONE", durationMs: 100 },
      { ruleId: RULE, subjectKey: `slot:${run}:2`, trigger: "schedule", status: "DONE", durationMs: 300 },
      { ruleId: RULE, subjectKey: `slot:${run}:3`, trigger: "schedule", status: "DEAD", error: `boom ${"x".repeat(500)}`, attempts: 3 },
    ],
  });
  jobId = (await prisma.job.create({ data: { type: JOB_TYPE, status: "DEAD", attempts: 5, lastError: "network down" } })).id;
});
afterAll(cleanup);

describe("Phase I: Control Center", () => {
  it("overview counts failures and given-up work", async () => {
    const o = await overview();
    expect(o.deadRuns).toBeGreaterThanOrEqual(1);
    expect(o.deadJobs).toBeGreaterThanOrEqual(1);
    expect(o.runs24h.failed).toBeGreaterThanOrEqual(1);
  });

  it("performance covers every rule and times only successful runs", async () => {
    const perf = await rulePerformance(7);
    expect(perf.map((p) => p.ruleId)).toEqual(RULE_IDS);
    const spam = perf.find((p) => p.ruleId === RULE)!;
    expect(spam.runs).toBeGreaterThanOrEqual(3);
    expect(spam.failed).toBeGreaterThanOrEqual(1);
    expect(spam.avgMs).not.toBeNull();
  });

  it("history filters by rule and status, and shortens long errors", async () => {
    const h = await runHistory({ ruleId: RULE, status: "DEAD" });
    const mine = h.rows.find((r) => r.subjectKey === `slot:${run}:3`)!;
    expect(mine.status).toBe("DEAD");
    expect(mine.error!.length).toBeLessThanOrEqual(300);
    expect(h.rows.every((r) => r.ruleId === RULE && r.status === "DEAD")).toBe(true);
    // An unknown rule id is ignored rather than trusted.
    const unfiltered = await runHistory({ ruleId: "nope'; drop", status: "DEAD" });
    expect(unfiltered.total).toBe((await runHistory({ status: "DEAD" })).total);
  });

  it("a dead job can be retried once, and it's audited with the admin's name", async () => {
    expect((await deadJobs()).some((j) => j.id === jobId)).toBe(true);
    expect(await retryDeadJob(adminId, jobId)).toEqual({ ok: true });
    expect(await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "PENDING", attempts: 0, lastError: null });
    expect(await retryDeadJob(adminId, jobId)).toEqual({ ok: false, error: "notRetryable" });
    expect(await retryDeadJob(adminId, "missing")).toEqual({ ok: false, error: "notFound" });
    const entry = (await automationAudit(50)).find((a) => a.entityId === jobId);
    expect(entry).toMatchObject({ action: "automation.job_retried", actorName: "Center Admin" });
  });

  it("delivery stats have every channel", async () => {
    const d = await deliveryStats(7);
    expect(d.channels.map((c) => c.channel)).toEqual(["PUSH", "EMAIL", "SMS"]);
  });
});
