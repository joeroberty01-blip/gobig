import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import { dashboardToday, providerAnalytics, recordMetrics } from "@/lib/services/metrics";
import { recordConnect } from "@/lib/services/connectEvents";
import { favoriteProviderIds, toggleFavorite } from "@/lib/services/favorites";
import { providerCardsByIds } from "@/lib/services/discovery";

// Phase 10 against the test branch: counting rules, aggregation and saved providers.
const run = `i${Date.now().toString(36)}`;
const domain = ".insights.test.gobig.local";
const now = new Date("2026-09-25T09:00:00Z"); // midday in Dar
const yesterday = new Date("2026-09-24T09:00:00Z");
const lastMonth = new Date("2026-08-20T09:00:00Z"); // inside the previous 30-day span

let ownerId: string;
let customerId: string;
let adminId: string;
let providerId: string;
let draftProviderId: string;
let slug: string;
let serviceId: string;
let locationId: string;

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER" | "ADMIN") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = await makeUser("Insight Owner", "PROVIDER");
  customerId = await makeUser("Insight Customer", "CUSTOMER");
  adminId = await makeUser("Insight Admin", "ADMIN");
  ({ providerId } = await profile.saveBusinessName(ownerId, `Maji Safi ${run}`));
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "water-tank-services" } });
  serviceId = service.id;
  locationId = (await prisma.location.findUniqueOrThrow({ where: { slug: "sinza" } })).id;
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.saveDescription(providerId, "Insights integration test provider, removed after the run.");
  await profile.saveContact(providerId, "255700000950", null);
  await profile.saveLocation(providerId, { locationId, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  slug = (await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).slug;
  const other = await makeUser("Draft Owner", "PROVIDER");
  ({ providerId: draftProviderId } = await profile.saveBusinessName(other, `Draft ${run}`));
}, 120_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("counting rules", () => {
  const base = { providerIds: [] as string[], source: "SEARCH" as const, visitorId: "visitorAAAAAAAAAAAAAAAA", viewer: null, now };

  it("one row per person per day, however many times they see you", async () => {
    const input = { ...base, kind: "SEARCH_APPEARANCE" as const, providerIds: [providerId], serviceId, locationId };
    expect(await recordMetrics(input)).toBe(1);
    expect(await recordMetrics(input)).toBe(0);
    expect(await recordMetrics({ ...input, visitorId: "visitorBBBBBBBBBBBBBBBB" })).toBe(1);
    expect(await recordMetrics({ ...input, now: yesterday })).toBe(1);
    expect(await recordMetrics({ ...input, now: lastMonth })).toBe(1);
  });

  it("the provider's own team, admins and non-live providers are never counted", async () => {
    const view = { ...base, kind: "PROFILE_VIEW" as const, providerIds: [providerId] };
    expect(await recordMetrics({ ...view, viewer: { id: ownerId, role: "PROVIDER" } })).toBe(0);
    expect(await recordMetrics({ ...view, viewer: { id: adminId, role: "ADMIN" } })).toBe(0);
    expect(await recordMetrics({ ...view, providerIds: [draftProviderId] })).toBe(0);
    expect(await recordMetrics({ ...view, viewer: { id: customerId, role: "CUSTOMER" }, source: "HOME" })).toBe(1);
  });

  it("only a salted daily hash is stored — never the visitor id", async () => {
    const rows = await prisma.providerMetric.findMany({ where: { providerId } });
    for (const r of rows) {
      expect(r.visitorHash).not.toContain("visitor");
      expect(r.visitorHash).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe("the analytics page's numbers", () => {
  beforeAll(async () => {
    await recordConnect({ slug, action: "CALL", source: "PROFILE", visitorId: "visitorAAAAAAAAAAAAAAAA", viewer: null, now });
    await toggleFavorite({ id: customerId, role: "CUSTOMER", status: "ACTIVE" }, providerId, true);
  });

  it("totals, sources, previous period and conversion", async () => {
    const a = await providerAnalytics(providerId, 30, now);
    expect(a.appearances.count).toBe(3); // A today, B today, A yesterday
    expect(a.appearances.previous).toBe(1); // last month
    expect(a.views.count).toBe(1);
    expect(a.views.bySource).toEqual([{ source: "HOME", count: 1 }]);
    expect(a.taps.count).toBe(1);
    expect(a.taps.byAction.CALL).toBe(1);
    expect(a.conversion.viewRate).toBeCloseTo(1 / 3);
    expect(a.conversion.contactRate).toBe(1);
    expect(a.favorites).toEqual({ total: 1, added: 1 });
    expect(a.topServices[0]?.service?.nameEn).toBeTruthy();
    expect(a.topAreas[0]).toEqual({ name: "Sinza", count: 3 });
  });

  it("the daily series has one entry per day, zeros included", async () => {
    const a = await providerAnalytics(providerId, 7, now);
    expect(a.series).toHaveLength(7);
    expect(a.series.at(-1)).toMatchObject({ appearances: 2, views: 1, taps: 1 });
    expect(a.series.at(-2)).toMatchObject({ appearances: 1, views: 0, taps: 0 });
    expect(a.series[0]).toMatchObject({ appearances: 0, views: 0, taps: 0 });
  });
});

describe("saved providers", () => {
  const customer = () => ({ id: customerId, role: "CUSTOMER", status: "ACTIVE" });

  it("only customers can save, only live providers, and saving twice is harmless", async () => {
    expect(await toggleFavorite({ id: ownerId, role: "PROVIDER", status: "ACTIVE" }, providerId, true)).toEqual({ ok: false, error: "notAllowed" });
    expect(await toggleFavorite(customer(), draftProviderId, true)).toEqual({ ok: false, error: "providerUnavailable" });
    expect(await toggleFavorite(customer(), providerId, true)).toEqual({ ok: true, saved: true });
    expect(await prisma.favorite.count({ where: { userId: customerId } })).toBe(1);
  });

  it("the saved list shows live providers as cards, and hides ones that go offline", async () => {
    expect((await providerCardsByIds(await favoriteProviderIds(customerId))).map((c) => c.id)).toEqual([providerId]);
    await prisma.provider.update({ where: { id: providerId }, data: { status: "DRAFT" } });
    expect(await providerCardsByIds(await favoriteProviderIds(customerId))).toEqual([]);
    await prisma.provider.update({ where: { id: providerId }, data: { status: "ACTIVE" } });
  });

  it("unsaving removes it", async () => {
    expect(await toggleFavorite(customer(), providerId, false)).toEqual({ ok: true, saved: false });
    expect(await favoriteProviderIds(customerId)).toEqual([]);
  });
});

describe("Phase 14 dashboard: today vs yesterday", () => {
  it("counts today's and yesterday's people separately, from the same records", async () => {
    await recordMetrics({ kind: "PROFILE_VIEW", providerIds: [providerId], source: "SEARCH", visitorId: "visitorCCCCCCCCCCCCCCCC", viewer: null, now: yesterday });
    const d = await dashboardToday(providerId, now);
    expect(d.views).toEqual({ today: 1, yesterday: 1 });
    expect(d.calls).toEqual({ today: 1, yesterday: 0 });
    expect(d.whatsapp).toEqual({ today: 0, yesterday: 0 });
    expect(d.requests).toEqual({ today: 0, yesterday: 0 });
    expect(d.reviews).toEqual({ today: 0, yesterday: 0 });
  });
});

