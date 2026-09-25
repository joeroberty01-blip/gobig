import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import { _clearAiCaches, aiSearch, loadCatalog } from "@/lib/services/aiSearch";

// Phase 9 against the test branch: sentence → intent → real ranked providers. Uses the rule-based
// extractor (useAi: false), so the tests never call — or pay for — the Claude API.
const run = `a${Date.now().toString(36)}`;
const domain = ".ai.test.gobig.local";
let providerId: string;

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  _clearAiCaches();
  const owner = await prisma.user.create({ data: { name: "AI Owner", email: `owner-${run}${domain}`, passwordHash: "x", role: "PROVIDER" } });
  ({ providerId } = await profile.saveBusinessName(owner.id, `Baridi AC ${run}`));
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "ac-repair" } });
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.saveDescription(providerId, "AI search integration test provider, removed after the run.");
  await profile.saveContact(providerId, "255700000990", null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: "mikocheni" } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
}, 120_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("AI search pipeline", () => {
  it("the catalogue comes from the database", async () => {
    const c = await loadCatalog();
    expect(c.services.find((s) => s.slug === "ac-repair")?.categorySlug).toBe("ac-refrigeration");
    expect(c.areas.some((a) => a.slug === "mikocheni")).toBe(true);
  });

  it("\"I need AC repair in Mikocheni today\" finds a real AC provider in Mikocheni", async () => {
    const r = await aiSearch("I need AC repair in Mikocheni today", null, new Date(), { useAi: false });
    expect(r.intent).toMatchObject({ service: "ac-repair", area: "mikocheni", timing: "TODAY", source: "rules" });
    expect(r.search?.results.map((c) => c.id)).toContain(providerId);
    // Every card is a real, live provider row — the pipeline adds nothing of its own.
    for (const card of r.search!.results) {
      expect(await prisma.provider.count({ where: { id: card.id, status: "ACTIVE", deletedAt: null } })).toBe(1);
    }
  });

  it("when the service can't be told, nothing is searched and we ask instead", async () => {
    const r = await aiSearch("I need someone good please", null, new Date(), { useAi: false });
    expect(r.search).toBeNull();
    expect(r.intent.clarify?.reason).toBe("SERVICE_UNKNOWN");
  });

  it("the customer's text is not stored", async () => {
    const marker = `zzqx${run}`;
    await aiSearch(`AC repair ${marker}`, null, new Date(), { useAi: false });
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "AuditLog" WHERE metadata::text LIKE $1`,
      `%${marker}%`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});
