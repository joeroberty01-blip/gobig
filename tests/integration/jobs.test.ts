import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { claim, enqueue, runDueJobs } from "@/lib/jobs/queue";

// Only rows of type "test:*" are touched, so other suites' jobs are left alone.
const T = "test:phase16";
const clean = () => prisma.job.deleteMany({ where: { type: { startsWith: "test:" } } });
beforeEach(clean);
afterAll(clean);

describe("job queue", () => {
  it("never hands the same job to two workers", async () => {
    for (let i = 0; i < 10; i++) await enqueue(T, { i });
    const [a, b, c] = await Promise.all([claim("w1", 10), claim("w2", 10), claim("w3", 10)]);
    const ids = [...a, ...b, ...c].filter((j) => j.type === T).map((j) => j.id);
    expect(ids.length).toBe(10);
    expect(new Set(ids).size).toBe(10);
  });

  it("retries with backoff, then marks the job dead", async () => {
    const { id } = await enqueue("test:fails", {}, { maxAttempts: 2 });
    const fail = { "test:fails": async () => { throw new Error("boom"); } };
    await runDueJobs(fail, { workerId: "w" });
    let job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("PENDING");
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
    await runDueJobs(fail, { workerId: "w", now: new Date(Date.now() + 60 * 60_000) });
    job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("DEAD");
    expect(job.lastError).toBe("boom");
  });

  it("runs a job once and frees its dedupe key when done", async () => {
    let runs = 0;
    const first = await enqueue("test:once", {}, { dedupeKey: "test:k1" });
    const again = await enqueue("test:once", {}, { dedupeKey: "test:k1" });
    expect(again).toEqual({ id: first.id, created: false });
    await runDueJobs({ "test:once": async () => void runs++ }, { workerId: "w" });
    expect(runs).toBe(1);
    const next = await enqueue("test:once", {}, { dedupeKey: "test:k1" });
    expect(next.created).toBe(true);
  });

  it("reclaims a job whose worker crashed", async () => {
    const { id } = await enqueue(T, {});
    await claim("crashed", 50);
    const later = new Date(Date.now() + 10 * 60_000);
    const reclaimed = await claim("rescuer", 50, later);
    expect(reclaimed.map((j) => j.id)).toContain(id);
  });
});
