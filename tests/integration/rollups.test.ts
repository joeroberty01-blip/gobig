import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { lastWeekStart, periodRange, providerMetrics, providerWeeks, rollUp } from "@/lib/analytics/rollups";
import { RULES } from "@/lib/automation/rules";

// Phase G: summaries on the test branch. Uses a week far in the past so live test data can't mix in.
const run = `g${Date.now().toString(36)}`;
const domain = ".rollup.test.gobig.local";
const WEEK = new Date("2001-01-01T00:00:00Z"); // a Monday
let providerId: string;
let ownerId: string;

async function cleanup() {
  await prisma.metricRollup.deleteMany({ where: { periodStart: WEEK } });
  if (providerId) await prisma.metricRollup.deleteMany({ where: { scopeId: providerId } });
  await prisma.provider.deleteMany({ where: { slug: { startsWith: `rollup-biz-${run}` } } });
  await prisma.automationRun.deleteMany({ where: { subjectKey: { contains: providerId ?? run } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = (await prisma.user.create({ data: { name: "Rollup Owner", email: `owner-${run}${domain}`, passwordHash: "x", role: "PROVIDER" } })).id;
  const reviewer = (await prisma.user.create({ data: { name: "Rollup Reviewer", email: `rev-${run}${domain}`, passwordHash: "x" } })).id;
  providerId = (await prisma.provider.create({ data: { slug: `rollup-biz-${run}`, status: "ACTIVE", members: { create: { userId: ownerId, role: "OWNER" } } } })).id;
  const r = periodRange("WEEK", WEEK);
  const inWeek = new Date(r.startTs.getTime() + 2 * 86_400_000);
  await prisma.providerMetric.createMany({
    data: [1, 2, 3].map((i) => ({ providerId, kind: "PROFILE_VIEW", source: "SEARCH", day: new Date(WEEK.getTime() + 86_400_000), visitorHash: `${run}-${i}` })),
  });
  await prisma.connectEvent.create({ data: { providerId, action: "CALL", source: "PROFILE", day: new Date(WEEK.getTime() + 86_400_000), visitorHash: `${run}-c` } });
  await prisma.review.create({ data: { providerId, authorId: reviewer, rating: 4, body: "Kazi nzuri, asante sana.", createdAt: inWeek } });
  // Outside the week: not counted.
  await prisma.providerMetric.create({ data: { providerId, kind: "PROFILE_VIEW", source: "SEARCH", day: new Date(WEEK.getTime() + 7 * 86_400_000), visitorHash: `${run}-late` } });
});
afterAll(cleanup);

describe("Phase G: rollups", () => {
  it("counts a business's week from the live tables, inside the week only", async () => {
    const m = (await providerMetrics("WEEK", WEEK)).get(providerId)!;
    expect(m).toMatchObject({ views: 3, contacts: 1, reviews: 1, ratingSum: 4 });
  });

  it("stores each period once and leaves it as it was", async () => {
    await rollUp("WEEK", WEEK);
    const first = await prisma.metricRollup.findUniqueOrThrow({ where: { period_periodStart_scope_scopeId: { period: "WEEK", periodStart: WEEK, scope: "PROVIDER", scopeId: providerId } } });
    await prisma.providerMetric.create({ data: { providerId, kind: "PROFILE_VIEW", source: "SEARCH", day: new Date(WEEK.getTime() + 86_400_000), visitorHash: `${run}-extra` } });
    await rollUp("WEEK", WEEK);
    const again = await prisma.metricRollup.findUniqueOrThrow({ where: { id: first.id } });
    expect((again.metrics as { views: number }).views).toBe(3);
    expect(await prisma.metricRollup.count({ where: { periodStart: WEEK, scope: "PLATFORM" } })).toBe(1);
    expect((await providerWeeks(providerId))[0]?.metrics.views).toBe(3);
  });
});

describe("Phase G: weekly summary", () => {
  it("sends each active business its summary once a week", async () => {
    const rule = RULES.find((r) => r.id === "analytics.weekly")!;
    // "Now" in the week after WEEK, so last week = WEEK.
    const now = new Date(WEEK.getTime() + 8 * 86_400_000);
    expect(lastWeekStart(now).toISOString()).toBe(WEEK.toISOString());
    await rule.run({ params: rule.defaults, now });
    await rule.run({ params: rule.defaults, now });
    const notes = await prisma.notification.findMany({ where: { userId: ownerId, type: "WEEKLY_SUMMARY" } });
    expect(notes).toHaveLength(1);
    // The saved week (3 views), not a recount that would include the view added afterwards.
    expect(notes[0]!.data).toMatchObject({ summary: { views: 3, contacts: 1, reviews: 1 } });
    await prisma.job.deleteMany({ where: { OR: notes.map((n) => ({ payload: { path: ["notificationId"], equals: n.id } })) } });
  });
});
