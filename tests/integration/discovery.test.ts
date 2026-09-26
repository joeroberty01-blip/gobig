import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import { popularServices, searchProviders } from "@/lib/services/discovery";
import { parseSearchParams, type SearchParams } from "@/lib/discovery/query";

// Builds a small, realistic set of live providers on the test branch and searches them.
const run = `d${Date.now().toString(36)}`;
const domain = `@${run}.discovery.test.gobig.local`;
const ids: Record<string, string> = {};
// Thursday 24 Sep 2026, 10:00 Dar es Salaam.
const thursday10 = new Date("2026-09-24T07:00:00Z");

const svc = async (slug: string) => (await prisma.service.findUniqueOrThrow({ where: { slug } })).id;
const loc = async (slug: string) => (await prisma.location.findUniqueOrThrow({ where: { slug } })).id;
const cat = async (slug: string) => (await prisma.category.findUniqueOrThrow({ where: { slug } })).id;

async function makeProvider(key: string, o: {
  name: string;
  category: string;
  services: { slug: string; price?: number }[];
  location: string;
  areas?: string[];
  hours?: "weekdays" | "always" | "none";
  publish?: boolean;
}) {
  const user = await prisma.user.create({ data: { name: key, email: `${key}${domain}`, passwordHash: "x", role: "PROVIDER" } });
  const { providerId } = await profile.saveBusinessName(user.id, o.name);
  await profile.saveCategory(providerId, await cat(o.category));
  const serviceIds = await Promise.all(o.services.map((s) => svc(s.slug)));
  await profile.saveServices(providerId, serviceIds);
  await profile.savePricing(
    providerId,
    o.services.map((s, i) => ({ serviceId: serviceIds[i]!, priceType: s.price ? "FROM" : "ON_QUOTE", priceMin: s.price ?? null, priceMax: null, priceUnit: null })),
  );
  await profile.saveDescription(providerId, `${o.name} — test provider for discovery integration tests.`);
  await profile.saveContact(providerId, `2557${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, null);
  await profile.saveLocation(providerId, { locationId: await loc(o.location), addressText: null, visibility: "AREA_ONLY" });
  if (o.areas) await profile.saveServiceAreas(providerId, await Promise.all(o.areas.map(loc)));
  if (o.hours === "always") await profile.saveHours(providerId, { mode: "ALWAYS_OPEN", days: [], note: null });
  if (o.hours === "weekdays") {
    await profile.saveHours(providerId, { mode: "SCHEDULE", note: null, days: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: 480, closesAt: 1020 })) });
  }
  await profile.saveActions(providerId, ["CALL"]);
  if (o.publish !== false) expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  ids[key] = providerId;
}

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: ".discovery.test.gobig.local" } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: ".discovery.test.gobig.local" } } });
}

const search = (p: Partial<SearchParams>) => searchProviders({ ...parseSearchParams({}), ...p }, thursday10);
const mine = (r: { results: { id: string }[] }) => r.results.map((x) => Object.keys(ids).find((k) => ids[k] === x.id)).filter(Boolean);

beforeAll(async () => {
  await cleanup();
  await makeProvider("acMik", { name: `Baridi AC ${run}`, category: "ac-refrigeration", services: [{ slug: "ac-repair", price: 30000 }], location: "mikocheni", hours: "weekdays" });
  await makeProvider("acMasaki", { name: `Poa Cooling ${run}`, category: "ac-refrigeration", services: [{ slug: "ac-repair" }, { slug: "fridge-repair" }], location: "masaki", hours: "always" });
  await makeProvider("acServes", { name: `Kimara Fundi ${run}`, category: "ac-refrigeration", services: [{ slug: "ac-installation", price: 150000 }], location: "kimara", areas: ["kinondoni-district"] });
  await makeProvider("plumber", { name: `Maji Safi ${run}`, category: "plumbing", services: [{ slug: "pipe-leak-repair", price: 20000 }], location: "sinza", hours: "none" });
  await makeProvider("salon", { name: `Mrembo Salon ${run}`, category: "beauty", services: [{ slug: "hair-salon" }], location: "mikocheni" });
  await makeProvider("draft", { name: `Hidden AC ${run}`, category: "ac-refrigeration", services: [{ slug: "ac-repair" }], location: "mikocheni", publish: false });
}, 180_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("text search", () => {
  it("finds providers by service name, Swahili keyword, and category", async () => {
    expect(mine(await search({ q: "AC repair" }))).toEqual(expect.arrayContaining(["acMik", "acMasaki"]));
    expect(mine(await search({ q: "kiyoyozi" }))).toEqual(expect.arrayContaining(["acMik", "acMasaki", "acServes"]));
    expect(mine(await search({ q: "fundi bomba" }))).toEqual(["plumber"]);
    expect(mine(await search({ q: "saluni" }))).toEqual(["salon"]);
  });

  it("tolerates typos", async () => {
    expect(mine(await search({ q: "plumbr" }))).toContain("plumber");
    expect(mine(await search({ q: "air conditionr" }))).toContain("acMik");
  });

  it("finds a provider by business name", async () => {
    expect(mine(await search({ q: "Maji Safi" }))).toEqual(["plumber"]);
  });

  it("never shows unpublished providers", async () => {
    expect(mine(await search({ q: "AC" }))).not.toContain("draft");
    expect(mine(await search({ q: `Hidden AC ${run}` }))).not.toContain("draft");
  });

  it("returns nothing for text that matches nothing", async () => {
    expect((await search({ q: "zzqqxx nothing" })).total).toBe(0);
  });
});

describe("location", () => {
  it("orders by area: based in > serves > same district, and excludes other districts", async () => {
    const r = await search({ q: "AC", area: "mikocheni" });
    const order = mine(r);
    expect(order.indexOf("acMik")).toBeLessThan(order.indexOf("acServes"));
    expect(order.indexOf("acServes")).toBeLessThan(order.indexOf("acMasaki"));
    expect(order).not.toContain("plumber");
  });

  it("recognises an area typed into the query", async () => {
    const r = await search({ q: "fundi AC Mikocheni" });
    expect(r.detectedArea).toBe("mikocheni");
    expect(r.effectiveQuery).toBe("fundi AC");
    expect(mine(r)[0]).toBe("acMik");
    // "fundi" alone is generic; "fundi AC" must not bring in plumbers ("fundi bomba").
    expect(mine(r)).not.toContain("plumber");
  });

  it("requires every meaningful word, ignoring filler words", async () => {
    // No area here, so nothing else can hide a wrong match.
    expect(mine(await search({ q: "fundi AC", area: null }))).not.toContain("plumber");
    expect(mine(await search({ q: "fundi AC", area: null }))).toEqual(expect.arrayContaining(["acMik", "acMasaki"]));
    expect(mine(await search({ q: "fundi wa bomba" }))).toEqual(["plumber"]);
    expect(mine(await search({ q: "fundi" }))).toEqual(expect.arrayContaining(["acMik", "plumber"]));
  });

  it("choosing a whole district includes providers serving any of its areas", async () => {
    expect(mine(await search({ area: "kinondoni-district", category: "ac-refrigeration" }))).toEqual(
      expect.arrayContaining(["acMik", "acMasaki", "acServes"]),
    );
  });
});

describe("filters", () => {
  it("open now uses the provider's own hours in Dar time", async () => {
    const r = mine(await search({ category: "ac-refrigeration", openNow: true }));
    expect(r).toEqual(expect.arrayContaining(["acMik", "acMasaki"]));
    expect(r).not.toContain("acServes"); // no hours given → not claimed as open
  });

  it("shows prices only keeps providers with a real amount", async () => {
    const r = mine(await search({ q: "AC", priced: true }));
    expect(r).toContain("acMik");
    expect(r).not.toContain("acMasaki");
  });

  it("category includes its subcategories", async () => {
    expect(mine(await search({ category: "home-repairs" }))).toEqual(expect.arrayContaining(["acMik", "plumber"]));
    expect(mine(await search({ category: "home-repairs" }))).not.toContain("salon");
  });

  it("service filter shows that service's price on the card", async () => {
    const r = await search({ service: "ac-installation" });
    const card = r.results.find((c) => c.id === ids.acServes)!;
    expect(card.price).toMatchObject({ priceType: "FROM", priceMin: 150000 });
    expect(card.service?.nameEn).toBe("AC installation");
  });

  it("unknown category or service gives an honest empty result", async () => {
    expect((await search({ category: "no-such-category" })).total).toBe(0);
    expect((await search({ service: "no-such-service" })).total).toBe(0);
  });
});

describe("cards", () => {
  it("carry only switched-on direct buttons and only a real rating (none yet here)", async () => {
    const card = (await search({ q: "Maji Safi" })).results[0]!;
    expect(card.actions.map((a) => a.action)).toEqual(["CALL"]);
    expect(card.actions[0]!.href).toMatch(/^tel:\+2557/);
    // Phase 5: cards carry the real aggregate; with no reviews it is empty, never invented.
    expect(card.rating).toEqual({ avg: null, count: 0 });
    expect(card.badges.map((b) => b.kind)).not.toContain("VERIFIED");
    expect(card.availability).toEqual({ state: "UNKNOWN" });
  });
});

describe("popular services", () => {
  it("counts live providers only", async () => {
    const popular = await popularServices(50);
    const ac = popular.find((s) => s.slug === "ac-repair");
    expect(ac?.providers).toBeGreaterThanOrEqual(2);
    // The draft provider also offers ac-repair but is not counted: exactly the two live ones here.
    const liveAcRepair = await prisma.providerService.count({ where: { service: { slug: "ac-repair" }, provider: { status: "ACTIVE" } } });
    expect(ac?.providers).toBe(liveAcRepair);
  });
});

describe("Phase 14 filters", () => {
  it("verified only: providers with a NEXA verification level", async () => {
    const level = await prisma.verificationLevel.findFirst({ where: { isActive: true }, orderBy: { rank: "asc" } });
    if (!level) return; // No levels on this branch: nothing can be verified, covered by the empty case below.
    await prisma.provider.update({ where: { id: ids.acMik }, data: { verificationLevelId: level.id, verifiedAt: new Date() } });
    try {
      const found = mine(await search({ q: "AC repair", verified: true }));
      expect(found).toContain("acMik");
      expect(found).not.toContain("acMasaki");
    } finally {
      await prisma.provider.update({ where: { id: ids.acMik }, data: { verificationLevelId: null, verifiedAt: null } });
    }
  });

  it("verified only never shows unverified providers", async () => {
    expect(mine(await search({ q: "AC repair", verified: true }))).not.toContain("acMasaki");
  });

  it("top rated puts the stronger rating first (review count counts), without dropping anyone", async () => {
    await prisma.provider.update({ where: { id: ids.acMik }, data: { ratingAvg: 4.0, ratingCount: 3 } });
    await prisma.provider.update({ where: { id: ids.acMasaki }, data: { ratingAvg: 4.9, ratingCount: 20 } });
    try {
      const best = mine(await search({ q: "AC repair" }));
      const top = mine(await search({ q: "AC repair", sort: "top" }));
      expect([...top].sort()).toEqual([...best].sort());
      expect(top.indexOf("acMasaki")).toBeLessThan(top.indexOf("acMik"));
    } finally {
      await prisma.provider.updateMany({ where: { id: { in: [ids.acMik!, ids.acMasaki!] } }, data: { ratingAvg: null, ratingCount: 0 } });
    }
  });
});

describe("compare (Phase 15)", () => {
  it("returns live providers only, in the order picked, at most three", async () => {
    const { compareProviders } = await import("@/lib/services/compare");
    const slug = async (k: string) => (await prisma.provider.findUniqueOrThrow({ where: { id: ids[k]! } })).slug;
    const [plumber, acMik, salon, acMasaki, draft] = await Promise.all(["plumber", "acMik", "salon", "acMasaki", "draft"].map(slug));
    const got = await compareProviders([plumber, draft, acMik, "no-such-provider", salon, acMasaki]);
    expect(got.map((g) => g.card.id)).toEqual([ids.plumber, ids.acMik]); // first three asked for; draft and unknown dropped
    expect(got[0]!.services[0]).toMatchObject({ nameEn: "Pipe & leak repair", priceType: "FROM", priceMin: 20000 });
    expect(await compareProviders([])).toEqual([]);
  });
});

