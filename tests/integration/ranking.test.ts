import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import * as requests from "@/lib/services/requests";
import { searchProviders } from "@/lib/services/discovery";
import { parseSearchParams } from "@/lib/discovery/query";
import { getWeights, providerStats, resetWeights, saveWeights } from "@/lib/services/ranking";
import { DEFAULT_WEIGHTS, SIGNALS, type Weights } from "@/lib/ranking/engine";

// Phase 8 ranking against the test branch: measured signals, weights, audit.
const run = `k${Date.now().toString(36)}`;
const domain = ".ranking.test.gobig.local";

let adminId: string;
let fastId: string; // answers every request within minutes
let slowId: string; // never answers
let fastSlug: string;
let slowSlug: string;

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER" | "ADMIN") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}

async function liveProvider(userId: string, name: string) {
  const { providerId } = await profile.saveBusinessName(userId, `${name} ${run}`);
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "tents-chairs-hire" } });
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.saveDescription(providerId, "Ranking integration test provider, removed after the run.");
  await profile.saveContact(providerId, "255700000800", null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: "tabata" } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  return providerId;
}

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

const search = (weights?: Weights) =>
  searchProviders({ ...parseSearchParams({}), service: "tents-chairs-hire", area: "tabata" }, new Date(), null, { weights, explain: true });

const position = (ids: string[], id: string) => ids.indexOf(id);

beforeAll(async () => {
  await cleanup();
  adminId = await makeUser("Rank Admin", "ADMIN");
  const customerId = await makeUser("Rank Customer", "CUSTOMER");
  // The slow provider is listed first, so a tie would favour it — the fast one must earn its place.
  slowId = await liveProvider(await makeUser("Slow Owner", "PROVIDER"), "Hema Polepole");
  fastId = await liveProvider(await makeUser("Fast Owner", "PROVIDER"), "Hema Haraka");
  fastSlug = (await prisma.provider.findUniqueOrThrow({ where: { id: fastId } })).slug;
  slowSlug = (await prisma.provider.findUniqueOrThrow({ where: { id: slowId } })).slug;

  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "tents-chairs-hire" } });
  const location = await prisma.location.findUniqueOrThrow({ where: { slug: "tabata" } });
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  for (let i = 0; i < 3; i++) {
    for (const slug of [fastSlug, slowSlug]) {
      const r = await requests.createRequest(
        { id: customerId, role: "CUSTOMER", status: "ACTIVE" },
        {
          serviceId: service.id,
          categoryId: service.categoryId,
          description: `Viti 100 na hema moja kwa sherehe (${i}).`,
          locationId: location.id,
          addressText: null,
          preferredDate: null,
          preferredTime: null,
          budgetMin: null,
          budgetMax: null,
          contactPreference: "IN_APP",
          targetProviderSlug: slug,
        },
      );
      if (!r.ok) throw new Error(`request failed: ${r.error}`);
      // Received two days ago; the fast provider answered 10 minutes later, the slow one never did.
      await prisma.requestMatch.updateMany({ where: { requestId: r.requestId }, data: { notifiedAt: twoDaysAgo } });
      if (slug === fastSlug) {
        await prisma.requestMatch.updateMany({
          where: { requestId: r.requestId },
          data: { status: "INTERESTED", firstResponseAt: new Date(twoDaysAgo.getTime() + 10 * 60_000) },
        });
      }
      // Close it so the customer's open-request cap isn't hit.
      await prisma.serviceRequest.update({ where: { id: r.requestId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    }
  }
}, 240_000);

afterAll(async () => {
  await resetWeights(adminId).catch(() => undefined);
  await cleanup();
  await prisma.$disconnect();
});

describe("measured signals", () => {
  it("response rate and median response time come from real requests", async () => {
    const stats = await providerStats([fastId, slowId]);
    expect(stats.get(fastId)).toMatchObject({ due: 3, responded: 3, responseSamples: 3, medianResponseMinutes: 10 });
    expect(stats.get(slowId)).toMatchObject({ due: 3, responded: 0, responseSamples: 0, medianResponseMinutes: null });
  });

  it("Fast response appears only for the provider who earned it", async () => {
    const r = await search();
    const badges = (id: string) => r.results.find((c) => c.id === id)?.badges.map((b) => b.kind) ?? [];
    expect(badges(fastId)).toContain("FAST_RESPONSE");
    expect(badges(slowId)).not.toContain("FAST_RESPONSE");
  });
});

describe("weights decide the order", () => {
  it("with the defaults, the responsive provider ranks above the unresponsive one", async () => {
    const r = await search(DEFAULT_WEIGHTS);
    const ids = r.results.map((c) => c.id);
    expect(position(ids, fastId)).toBeLessThan(position(ids, slowId));
    const fast = r.explain!.get(fastId)!;
    const slow = r.explain!.get(slowId)!;
    expect(fast.breakdown.responseRate).toBeGreaterThan(slow.breakdown.responseRate);
    expect(fast.breakdown.responseTime).toBeGreaterThan(slow.breakdown.responseTime);
  });

  it("verification can outrank responsiveness when an admin weights it so", async () => {
    const level = await prisma.verificationLevel.findFirstOrThrow({ where: { isActive: true }, orderBy: { rank: "desc" } });
    await prisma.provider.update({ where: { id: slowId }, data: { verificationLevelId: level.id, verifiedAt: new Date() } });
    const onlyVerification = { ...(Object.fromEntries(SIGNALS.map((s) => [s, 0])) as Weights), serviceRelevance: 1, verification: 10 };
    const ids = (await search(onlyVerification)).results.map((c) => c.id);
    expect(position(ids, slowId)).toBeLessThan(position(ids, fastId));
    await prisma.provider.update({ where: { id: slowId }, data: { verificationLevelId: null, verifiedAt: null } });
  });

  it("a paid/featured flag can't be passed in — the result shape has no such input", async () => {
    const r = await search();
    for (const e of r.explain!.values()) expect(Object.keys(e.breakdown).sort()).toEqual([...SIGNALS].sort());
  });
});

describe("configuration", () => {
  it("saving is audited with the before and after values, and takes effect", async () => {
    const changed = { ...DEFAULT_WEIGHTS, recentActivity: 2 };
    await saveWeights(adminId, changed);
    expect(await getWeights()).toEqual(changed);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: adminId, action: "ranking.weights_saved" }, orderBy: { createdAt: "desc" } });
    expect(log.metadata).toMatchObject({ after: changed });
    await resetWeights(adminId);
    expect(await getWeights()).toEqual(DEFAULT_WEIGHTS);
  });
});
