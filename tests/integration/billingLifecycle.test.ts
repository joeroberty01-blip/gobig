import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { grantTrial } from "@/lib/billing/lifecycle";
import { currentPlan } from "@/lib/services/billing";
import { RULES } from "@/lib/automation/rules";

// Automation Engine, Phase H on the test branch: remind, never charge.
const run = `h${Date.now().toString(36)}`;
const domain = ".billing.test.gobig.local";
const DAY = 86_400_000;
let providerId: string;
let ownerId: string;
let adminId: string;
let planId: string;

const rule = (id: string) => RULES.find((r) => r.id === id)!;
const notices = (type: string) => prisma.notification.count({ where: { userId: ownerId, type } });

async function cleanup() {
  const ids = (await prisma.notification.findMany({ where: { user: { email: { endsWith: domain } } }, select: { id: true } })).map((n) => n.id);
  if (ids.length) await prisma.job.deleteMany({ where: { OR: ids.map((id) => ({ payload: { path: ["notificationId"], equals: id } })) } });
  await prisma.automationRun.deleteMany({ where: { ruleId: "billing.notices" } });
  await prisma.provider.deleteMany({ where: { slug: { startsWith: `billing-biz-${run}` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = (await prisma.user.create({ data: { name: "Billing Owner", email: `owner-${run}${domain}`, passwordHash: "x", role: "PROVIDER" } })).id;
  adminId = (await prisma.user.create({ data: { name: "Billing Admin", email: `admin-${run}${domain}`, passwordHash: "x", role: "ADMIN" } })).id;
  providerId = (await prisma.provider.create({ data: { slug: `billing-biz-${run}`, status: "ACTIVE", members: { create: { userId: ownerId, role: "OWNER" } } } })).id;
  planId = (await prisma.plan.findFirstOrThrow({ where: { code: { not: "FREE" }, isActive: true } })).id;
});
afterAll(cleanup);

describe("Phase H: free trials", () => {
  it("an admin grants a trial: the plan is active, priced 0, with no payment", async () => {
    const r = await grantTrial(adminId, providerId, planId, 14);
    expect(r.ok).toBe(true);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { providerId } });
    expect(sub).toMatchObject({ isTrial: true, priceTzs: 0, status: "ACTIVE" });
    expect(await prisma.payment.count({ where: { providerId } })).toBe(0);
    expect((await currentPlan(providerId)).plan?.id).toBe(planId);
    expect(await grantTrial(adminId, providerId, planId, 14)).toEqual({ ok: false, error: "subscriptionOpen" });
  });
});

describe("Phase H: renewal reminders", () => {
  it("reminds once a week before, once the day before, once after — and never charges", async () => {
    const sub = await prisma.subscription.findFirstOrThrow({ where: { providerId } });
    const r = rule("billing.renewal-reminder");
    const end = sub.currentPeriodEnd!;

    await r.run({ params: r.defaults, now: new Date(end.getTime() - 6 * DAY) });
    await r.run({ params: r.defaults, now: new Date(end.getTime() - 5 * DAY) });
    expect(await notices("SUBSCRIPTION_ENDING")).toBe(1);

    await r.run({ params: r.defaults, now: new Date(end.getTime() - 12 * 3_600_000) });
    expect(await notices("SUBSCRIPTION_ENDING")).toBe(2);

    const after = new Date(end.getTime() + 3_600_000);
    await r.run({ params: r.defaults, now: after });
    await r.run({ params: r.defaults, now: after });
    expect(await notices("SUBSCRIPTION_ENDED")).toBe(1);

    // Back on Free; no payment was ever created.
    expect((await currentPlan(providerId, after)).plan?.code).toBe("FREE");
    expect(await prisma.payment.count({ where: { providerId } })).toBe(0);
  });
});

describe("Phase H: campaigns", () => {
  it("marks a finished campaign as ended and tells the business once", async () => {
    const yesterday = new Date(Date.now() - 2 * DAY);
    const c = await prisma.featuredCampaign.create({
      data: { providerId, kind: "FEATURED_SEARCH", startsAt: new Date(Date.now() - 10 * DAY), endsAt: yesterday, status: "ACTIVE", priceTzs: 1000 },
    });
    const r = rule("campaign.lifecycle");
    await r.run({ params: r.defaults, now: new Date() });
    await r.run({ params: r.defaults, now: new Date() });
    expect((await prisma.featuredCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ENDED");
    expect(await notices("CAMPAIGN_ENDED")).toBe(1);
  });
});
