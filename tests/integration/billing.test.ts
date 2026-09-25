import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import * as billing from "@/lib/services/billing";
import * as requests from "@/lib/services/requests";
import { searchProviders } from "@/lib/services/discovery";
import { parseSearchParams } from "@/lib/discovery/query";
import { reviewQueue } from "@/lib/services/verification";
import { darDay } from "@/lib/services/connectEvents";

// Phase 11 against the test branch. Plans are seeded by prisma/seeds/plans.ts; this suite sets a
// PRO/FEATURED price for the run and restores everything afterwards.
const run = `b${Date.now().toString(36)}`;
const domain = ".billing.test.gobig.local";
const SERVICE = "cctv-installation";
const AREA = "kurasini";

let adminId: string;
let customerId: string;
let ownerA: string;
let ownerB: string;
let providerA: string;
let providerB: string;
let otherServiceId: string;
let pro: { id: string; priceTzs: number | null };
let featured: { id: string; priceTzs: number | null };
let settingsBefore: billing.MonetizationSettings;
const refs: string[] = [];
const ref = (s: string) => {
  const r = `${s}${run}`.toUpperCase();
  refs.push(r);
  return r;
};

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER" | "ADMIN") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}

async function liveProvider(userId: string, name: string) {
  const { providerId } = await profile.saveBusinessName(userId, `${name} ${run}`);
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: SERVICE } });
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.saveDescription(providerId, "Billing integration test provider, removed after the run.");
  await profile.saveContact(providerId, "255700000970", null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: AREA } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  return providerId;
}

const pay = (amountTzs: number, reference: string) => ({ amountTzs, method: "MPESA" as const, reference, paidAt: new Date() });
const search = () => searchProviders({ ...parseSearchParams({}), service: SERVICE, area: AREA });

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  adminId = await makeUser("Billing Admin", "ADMIN");
  customerId = await makeUser("Billing Customer", "CUSTOMER");
  ownerA = await makeUser("Owner A", "PROVIDER");
  ownerB = await makeUser("Owner B", "PROVIDER");
  providerA = await liveProvider(ownerA, "Ulinzi Bora");
  providerB = await liveProvider(ownerB, "Kamera Safi");
  otherServiceId = (await prisma.service.findUniqueOrThrow({ where: { slug: "catering" } })).id;
  pro = await prisma.plan.findUniqueOrThrow({ where: { code: "PRO" }, select: { id: true, priceTzs: true } });
  featured = await prisma.plan.findUniqueOrThrow({ where: { code: "FEATURED" }, select: { id: true, priceTzs: true } });
  settingsBefore = await billing.getSettings();
}, 180_000);

afterAll(async () => {
  await prisma.plan.update({ where: { id: pro.id }, data: { priceTzs: pro.priceTzs } });
  await prisma.plan.update({ where: { id: featured.id }, data: { priceTzs: featured.priceTzs } });
  await prisma.plan.updateMany({ where: { code: "FREE" }, data: { leadsPerMonth: null } });
  await prisma.monetizationSettings.upsert({ where: { id: "default" }, create: { id: "default", ...settingsBefore }, update: settingsBefore });
  await cleanup();
  await prisma.$disconnect();
});

describe("plans", () => {
  it("every provider starts on Free with today's 12-photo gallery", async () => {
    expect((await billing.currentPlan(providerA)).plan?.code).toBe("FREE");
    expect(await billing.galleryLimitFor(providerA)).toBe(12);
  });

  it("a plan without a price can't be requested; the free plan can't be requested", async () => {
    await prisma.plan.update({ where: { id: pro.id }, data: { priceTzs: null } });
    expect(await billing.requestPlan(providerA, ownerA, pro.id)).toEqual({ ok: false, error: "planNotPriced" });
    const free = await prisma.plan.findUniqueOrThrow({ where: { code: "FREE" } });
    expect(await billing.requestPlan(providerA, ownerA, free.id)).toEqual({ ok: false, error: "planUnavailable" });
  });

  it("requesting a priced plan creates one pending subscription at that price", async () => {
    await prisma.plan.update({ where: { id: pro.id }, data: { priceTzs: 20_000 } });
    const r = await billing.requestPlan(providerA, ownerA, pro.id);
    expect(r.ok).toBe(true);
    expect(await billing.requestPlan(providerA, ownerA, pro.id)).toEqual({ ok: false, error: "subscriptionOpen" });
    // The database refuses a second open subscription even if the service were bypassed.
    await expect(prisma.subscription.create({ data: { providerId: providerA, planId: pro.id, priceTzs: 1 } })).rejects.toThrow();
    // A later price change doesn't change what this provider agreed to pay.
    await prisma.plan.update({ where: { id: pro.id }, data: { priceTzs: 25_000 } });
    expect((await prisma.subscription.findFirstOrThrow({ where: { providerId: providerA } })).priceTzs).toBe(20_000);
  });
});

describe("payments", () => {
  let subId: string;
  beforeAll(async () => {
    subId = (await prisma.subscription.findFirstOrThrow({ where: { providerId: providerA, status: "PENDING_PAYMENT" } })).id;
  });

  it("the amount must match exactly", async () => {
    expect(await billing.recordSubscriptionPayment(adminId, subId, pay(19_000, ref("SHORT")))).toEqual({ ok: false, error: "amountMismatch" });
  });

  it("a correct payment activates the plan for one period, and the plan's features apply", async () => {
    const r = await billing.recordSubscriptionPayment(adminId, subId, pay(20_000, ref("FIRST")));
    expect(r.ok).toBe(true);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } });
    expect(sub.status).toBe("ACTIVE");
    expect(Math.round((sub.currentPeriodEnd!.getTime() - sub.currentPeriodStart!.getTime()) / 86_400_000)).toBe(30);
    expect((await billing.currentPlan(providerA)).plan?.code).toBe("PRO");
    expect(await billing.galleryLimitFor(providerA)).toBe(30);
    const log = await prisma.auditLog.findFirst({ where: { entityId: subId, action: "subscription.activated" } });
    expect(log?.actorId).toBe(adminId);
  });

  it("the same reference can't be recorded twice; a renewal extends the period", async () => {
    const before = (await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })).currentPeriodEnd!;
    expect(await billing.recordSubscriptionPayment(adminId, subId, pay(20_000, refs.at(-1)!))).toEqual({ ok: false, error: "paymentDuplicate" });
    expect((await billing.recordSubscriptionPayment(adminId, subId, pay(20_000, ref("RENEW")))).ok).toBe(true);
    const after = (await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })).currentPeriodEnd!;
    expect(Math.round((after.getTime() - before.getTime()) / 86_400_000)).toBe(30);
  });

  it("an expired plan falls back to Free without anyone having to act", async () => {
    await prisma.subscription.update({ where: { id: subId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect((await billing.currentPlan(providerA)).plan?.code).toBe("FREE");
    await prisma.subscription.update({ where: { id: subId }, data: { currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
  });
});

describe("paying never touches trust", () => {
  it("no badge, verification level or rating comes with a plan", async () => {
    const p = await prisma.provider.findUniqueOrThrow({ where: { id: providerA }, select: { verificationLevelId: true, ratingAvg: true, ratingCount: true } });
    expect(p).toEqual({ verificationLevelId: null, ratingAvg: null, ratingCount: 0 });
    const card = (await search()).results.find((c) => c.id === providerA);
    expect(card?.badges.map((b) => b.kind)).not.toContain("VERIFIED");
  });
});

describe("featured campaigns", () => {
  let campaignId: string;
  const today = () => darDay(new Date());

  it("Free plans can't buy campaigns; targets must be the provider's own services", async () => {
    const input = { kind: "FEATURED_SEARCH" as const, serviceId: null, categoryId: null, locationId: null, startsAt: today(), endsAt: today() };
    expect(await billing.requestCampaign(providerB, ownerB, input)).toEqual({ ok: false, error: "campaignNotAllowed" });
    expect(await billing.requestCampaign(providerA, ownerA, { ...input, serviceId: otherServiceId })).toEqual({ ok: false, error: "campaignInvalid" });
    expect(await billing.requestCampaign(providerA, ownerA, { ...input, startsAt: new Date(today().getTime() - 86_400_000) })).toEqual({ ok: false, error: "campaignInvalid" });
  });

  it("request → approve with a price → pay → running", async () => {
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: SERVICE } });
    const r = await billing.requestCampaign(providerA, ownerA, { kind: "FEATURED_SEARCH", serviceId: service.id, categoryId: null, locationId: null, startsAt: today(), endsAt: new Date(today().getTime() + 6 * 86_400_000) });
    if (!r.ok) throw new Error(r.error);
    campaignId = r.campaignId;
    expect(await billing.updateCampaign(adminId, campaignId, "pause")).toEqual({ ok: false, error: "campaignStateInvalid" });
    expect(await billing.updateCampaign(adminId, campaignId, "approve", {})).toEqual({ ok: false, error: "campaignInvalid" });
    expect(await billing.updateCampaign(adminId, campaignId, "approve", { priceTzs: 50_000 })).toEqual({ ok: true });
    expect(await billing.recordCampaignPayment(adminId, campaignId, pay(40_000, ref("CAMPSHORT")))).toEqual({ ok: false, error: "amountMismatch" });
    expect(await billing.recordCampaignPayment(adminId, campaignId, pay(50_000, ref("CAMP")))).toEqual({ ok: true });
    expect((await prisma.featuredCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("ACTIVE");
  });

  it("a running campaign gets a Sponsored slot only on searches it matches, and only if the provider is in the results", async () => {
    const r = await search();
    const slots = await billing.sponsoredFor({ kind: "FEATURED_SEARCH", candidateIds: r.rankedIds, serviceId: r.filterIds.serviceId, categoryIds: r.categoryIds, locationIds: r.areaIds });
    expect(slots).toContain(providerA);
    // Not relevant to this search → no slot, whatever was paid.
    expect(await billing.sponsoredFor({ kind: "FEATURED_SEARCH", candidateIds: r.rankedIds.filter((id) => id !== providerA), serviceId: r.filterIds.serviceId, categoryIds: [], locationIds: [] })).not.toContain(providerA);
    // Targeted at a different service → no slot.
    expect(await billing.sponsoredFor({ kind: "FEATURED_SEARCH", candidateIds: r.rankedIds, serviceId: otherServiceId, categoryIds: [], locationIds: [] })).not.toContain(providerA);
  });

  it("the ranked (organic) results are identical with and without the campaign", async () => {
    const withCampaign = (await search()).rankedIds;
    await billing.updateCampaign(adminId, campaignId, "pause");
    const without = (await search()).rankedIds;
    expect(withCampaign).toEqual(without);
    await billing.updateCampaign(adminId, campaignId, "resume");
  });

  it("slots respect the admin's setting", async () => {
    const r = await search();
    await prisma.monetizationSettings.upsert({ where: { id: "default" }, create: { id: "default", featuredSlots: 0 }, update: { featuredSlots: 0 } });
    expect(await billing.sponsoredFor({ kind: "FEATURED_SEARCH", candidateIds: r.rankedIds, serviceId: r.filterIds.serviceId, categoryIds: r.categoryIds, locationIds: r.areaIds })).toEqual([]);
    await prisma.monetizationSettings.update({ where: { id: "default" }, data: { featuredSlots: settingsBefore.featuredSlots } });
  });

  it("a Featured plan brings its own Sponsored placement for the plan's dates", async () => {
    await prisma.plan.update({ where: { id: featured.id }, data: { priceTzs: 60_000 } });
    const req = await billing.requestPlan(providerB, ownerB, featured.id);
    if (!req.ok) throw new Error(req.error);
    expect((await billing.recordSubscriptionPayment(adminId, req.subscriptionId, pay(60_000, ref("FEAT")))).ok).toBe(true);
    const c = await prisma.featuredCampaign.findFirstOrThrow({ where: { providerId: providerB, note: `plan:${req.subscriptionId}` } });
    expect(c.status).toBe("ACTIVE");
    expect(await billing.adminCancelSubscription(adminId, req.subscriptionId, "test cancel")).toEqual({ ok: true });
    expect((await prisma.featuredCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ENDED");
  });
});

describe("paid leads (off by default)", () => {
  it("with paid leads off, nothing changes for anyone", async () => {
    expect(await billing.leadAllowance(providerB)).toEqual({ allowed: true, used: 0, limit: null });
  });

  it("switched on with a monthly limit, a provider over the limit can't start answering a new request", async () => {
    await prisma.monetizationSettings.upsert({ where: { id: "default" }, create: { id: "default", paidLeadsEnabled: true }, update: { paidLeadsEnabled: true } });
    await prisma.plan.updateMany({ where: { code: "FREE" }, data: { leadsPerMonth: 0 } });
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: SERVICE } });
    const location = await prisma.location.findUniqueOrThrow({ where: { slug: AREA } });
    const slugB = (await prisma.provider.findUniqueOrThrow({ where: { id: providerB } })).slug;
    const r = await requests.createRequest(
      { id: customerId, role: "CUSTOMER", status: "ACTIVE" },
      { serviceId: service.id, categoryId: service.categoryId, description: "Kamera 4 za CCTV kwa duka.", locationId: location.id, addressText: null, preferredDate: null, preferredTime: null, budgetMin: null, budgetMax: null, contactPreference: "IN_APP", targetProviderSlug: slugB },
    );
    if (!r.ok) throw new Error(r.error);
    expect(await requests.expressInterest(providerB, r.requestId)).toEqual({ ok: false, error: "leadLimitReached" });
    expect(await requests.sendQuote(providerB, r.requestId, { amount: 100_000, note: null, validUntil: null })).toEqual({ ok: false, error: "leadLimitReached" });
    // Switching it off restores normal behaviour immediately.
    await prisma.monetizationSettings.update({ where: { id: "default" }, data: { paidLeadsEnabled: false } });
    expect(await requests.expressInterest(providerB, r.requestId)).toEqual({ ok: true });
  });
});

describe("priority verification review", () => {
  it("orders the queue only; nothing else about the application changes", async () => {
    const level = await prisma.verificationLevel.findFirstOrThrow({ where: { isActive: true } });
    // B applies first (no priority plan), A (Pro — no priority either) second.
    for (const pid of [providerB, providerA]) {
      await prisma.verificationRequest.create({ data: { providerId: pid, levelId: level.id, status: "SUBMITTED", submittedAt: new Date() } });
    }
    // Give A a priority plan: it moves ahead of B.
    await prisma.plan.update({ where: { id: pro.id }, data: { priorityVerificationReview: true } });
    const queue = await reviewQueue("SUBMITTED");
    const names = await prisma.provider.findMany({ where: { id: { in: [providerA, providerB] } }, select: { id: true, slug: true } });
    const pos = (id: string) => queue.findIndex((r) => r.provider.slug === names.find((n) => n.id === id)!.slug);
    expect(pos(providerA)).toBeLessThan(pos(providerB));
    expect(queue[pos(providerA)]!.priority).toBe(true);
    expect(queue[pos(providerB)]!.priority).toBe(false);
    await prisma.plan.update({ where: { id: pro.id }, data: { priorityVerificationReview: false } });
  });
});
