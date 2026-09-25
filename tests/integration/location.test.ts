import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import { searchProviders } from "@/lib/services/discovery";
import { getPublicProfile } from "@/lib/data/provider";
import { parseSearchParams, type SearchParams } from "@/lib/discovery/query";
import { distanceKm, snapApprox } from "@/lib/geo";

// Location engine against the test branch: positions, radius coverage, privacy of public points.
const run = `l${Date.now().toString(36)}`;
const domain = ".location.test.gobig.local";
const ids: Record<string, string> = {};
const slugs: Record<string, string> = {};
const now = new Date("2026-09-24T07:00:00Z");

// Customer standing in Mikocheni (rounded like a real cookie value).
const inMikocheni = { lat: -6.764, lng: 39.254 };
// A home-based provider's private pin, a few hundred metres from that customer.
const privatePin = { lat: -6.76712, lng: 39.25873 };

const loc = async (slug: string) => (await prisma.location.findUniqueOrThrow({ where: { slug } })).id;

async function make(key: string, o: { location: string; visibility: "EXACT" | "APPROXIMATE" | "AREA_ONLY"; pin?: { lat: number; lng: number }; radiusKm?: number; address?: string }) {
  const user = await prisma.user.create({ data: { name: key, email: `${key}-${run}${domain}`, passwordHash: "x", role: "PROVIDER" } });
  const { providerId } = await profile.saveBusinessName(user.id, `${key} ${run}`);
  const acId = (await prisma.category.findUniqueOrThrow({ where: { slug: "ac-refrigeration" } })).id;
  await profile.saveCategory(providerId, acId);
  await profile.saveServices(providerId, [(await prisma.service.findUniqueOrThrow({ where: { slug: "ac-repair" } })).id]);
  await profile.saveDescription(providerId, "Location engine integration test provider, deleted afterwards.");
  await profile.saveContact(providerId, "255700000300", null);
  const r = await profile.saveLocation(providerId, {
    locationId: await loc(o.location),
    addressText: o.address ?? null,
    visibility: o.visibility,
    latitude: o.pin?.lat ?? null,
    longitude: o.pin?.lng ?? null,
    radiusKm: o.radiusKm ?? null,
  });
  expect(r).toEqual({ ok: true });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  ids[key] = providerId;
  slugs[key] = (await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).slug;
}

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

const search = (p: Partial<SearchParams>, point: { lat: number; lng: number } | null) =>
  searchProviders({ ...parseSearchParams({}), q: "AC repair", ...p }, now, point);
const card = (r: Awaited<ReturnType<typeof search>>, key: string) => r.results.find((c) => c.id === ids[key]);
const keys = (r: Awaited<ReturnType<typeof search>>) => r.results.map((c) => Object.keys(ids).find((k) => ids[k] === c.id)).filter(Boolean);

beforeAll(async () => {
  await cleanup();
  await make("shopExact", { location: "mikocheni", visibility: "EXACT", pin: { lat: -6.7625, lng: 39.2531 }, address: "Plot 1" });
  await make("homeApprox", { location: "mikocheni", visibility: "APPROXIMATE", pin: privatePin });
  await make("homeArea", { location: "mikocheni", visibility: "AREA_ONLY", pin: privatePin });
  await make("kimaraRadius", { location: "kimara", visibility: "AREA_ONLY", radiusKm: 10 });
  // Somangila (~27 km away) — beyond NEARBY_KM and with no travel radius.
  await make("kigamboniFar", { location: "somangila", visibility: "AREA_ONLY" });
}, 180_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("searching from the customer's position", () => {
  it("derives the nearest area and measures distance from the customer", async () => {
    const r = await search({}, inMikocheni);
    expect(r.origin?.kind).toBe("you");
    expect(r.areaFromPosition).toBe(true);
    expect(r.area?.slug).toBe("mikocheni");
    expect(card(r, "shopExact")?.distance?.precision).toBe("exact");
    expect(card(r, "shopExact")!.distance!.km).toBeLessThan(0.5);
  });

  it("includes a provider whose travel radius reaches the customer, and ranks by coverage then distance", async () => {
    const r = await search({}, inMikocheni);
    const order = keys(r);
    // Kimara is ~8 km away but travels 10 km → serves the customer.
    expect(order).toContain("kimaraRadius");
    expect(card(r, "kimaraRadius")?.tier).toBe(1);
    // Based-in-area providers come before the one that only travels here.
    expect(order.indexOf("shopExact")).toBeLessThan(order.indexOf("kimaraRadius"));
  });

  it("leaves out providers that are far away and don't serve the customer", async () => {
    expect(keys(await search({}, inMikocheni))).not.toContain("kigamboniFar");
  });

  it("an explicit area wins over the position", async () => {
    const r = await search({ area: "kigamboni" }, inMikocheni);
    expect(r.origin?.kind).toBe("area");
    expect(keys(r)).toContain("kigamboniFar");
    expect(keys(r)).not.toContain("shopExact");
  });
});

describe("provider location privacy", () => {
  it("never puts a non-EXACT provider's real pin on a card", async () => {
    const r = await search({}, inMikocheni);
    const approx = card(r, "homeApprox")!;
    const area = card(r, "homeArea")!;
    expect(approx.mapPoint).toMatchObject({ precision: "approx", ...snapApprox(privatePin) });
    expect(approx.mapPoint).not.toMatchObject(privatePin);
    expect(area.mapPoint?.precision).toBe("area");
    expect(distanceKm(area.mapPoint!, privatePin)).toBeGreaterThan(0.2);
    // Card JSON (what reaches the browser) contains no trace of the private pin.
    const json = JSON.stringify([approx, area]);
    expect(json).not.toContain(String(privatePin.lat));
    expect(json).not.toContain(String(privatePin.lng));
  });

  it("the public profile exposes only the public point and never the address when hidden", async () => {
    const p = await getPublicProfile(slugs.homeArea!, null, inMikocheni);
    const json = JSON.stringify(p);
    expect(json).not.toContain(String(privatePin.lat));
    expect(p?.mapPoint?.precision).toBe("area");
    expect(p?.distance?.precision).toBe("area");
    expect(p?.actions.map((a) => a.action)).not.toContain("DIRECTIONS");
  });

  it("EXACT providers get pin-based directions", async () => {
    await profile.saveActions(ids.shopExact!, ["CALL", "DIRECTIONS"]);
    const p = await getPublicProfile(slugs.shopExact!, null);
    expect(p?.actions.find((a) => a.action === "DIRECTIONS")?.href).toBe("https://www.google.com/maps/dir/?api=1&destination=-6.7625,39.2531");
  });

  it("switching a live provider from EXACT to approximate removes Directions automatically", async () => {
    await profile.saveLocation(ids.shopExact!, { locationId: await loc("mikocheni"), addressText: "Plot 1", visibility: "APPROXIMATE", latitude: -6.7625, longitude: 39.2531 });
    const pr = await prisma.providerProfile.findUniqueOrThrow({ where: { providerId: ids.shopExact! } });
    expect(pr.enabledActions).toEqual(["CALL"]);
  });
});

describe("SEC-020 radius coverage can't be used to trace a private pin", () => {
  it("coverage is decided from the public (area) point, not the hidden pin", async () => {
    // Pin deep in Kinondoni, but area-only with its area set to Somangila → public point = Somangila.
    const user = await prisma.user.create({ data: { name: "probe", email: `probe-${run}${domain}`, passwordHash: "x", role: "PROVIDER" } });
    const { providerId } = await profile.saveBusinessName(user.id, `probe ${run}`);
    await profile.saveCategory(providerId, (await prisma.category.findUniqueOrThrow({ where: { slug: "ac-refrigeration" } })).id);
    await profile.saveServices(providerId, [(await prisma.service.findUniqueOrThrow({ where: { slug: "ac-repair" } })).id]);
    await profile.saveDescription(providerId, "Privacy probe provider for the radius-coverage regression test.");
    await profile.saveContact(providerId, "255700000301", null);
    await profile.saveLocation(providerId, { locationId: await loc("somangila"), addressText: null, visibility: "AREA_ONLY", latitude: privatePin.lat, longitude: privatePin.lng, radiusKm: 2 });
    await profile.saveActions(providerId, ["CALL"]);
    await profile.publishProvider(providerId);
    ids.probe = providerId;
    // A customer standing right on the hidden pin must NOT be told the provider serves them.
    const r = await search({}, { lat: -6.767, lng: 39.259 });
    const c = card(r, "probe");
    expect(c === undefined || c.tier !== 1).toBe(true);
  });
});

describe("database rules", () => {
  it("refuses a half-set pin or an out-of-range radius", async () => {
    await expect(prisma.providerProfile.update({ where: { providerId: ids.homeArea! }, data: { latitude: null } })).rejects.toThrow();
    await expect(prisma.providerProfile.update({ where: { providerId: ids.homeArea! }, data: { serviceRadiusKm: 500 } })).rejects.toThrow();
  });
});
