import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import { connectStats, recordConnect } from "@/lib/services/connectEvents";
import { getPublicProfile } from "@/lib/data/provider";

// Phase 6 connection system against the test branch.
const run = `c${Date.now().toString(36)}`;
const domain = ".connect.test.gobig.local";
let ownerId: string;
let adminId: string;
let providerId: string;
let slug: string;
const now = new Date("2026-09-24T07:00:00Z");

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = (await prisma.user.create({ data: { name: "Owner", email: `owner-${run}${domain}`, passwordHash: "x", role: "PROVIDER" } })).id;
  adminId = (await prisma.user.create({ data: { name: "Admin", email: `admin-${run}${domain}`, passwordHash: "x", role: "ADMIN" } })).id;
  providerId = (await profile.saveBusinessName(ownerId, `Usafiri Haraka ${run}`)).providerId;
  await profile.saveCategory(providerId, (await prisma.category.findUniqueOrThrow({ where: { slug: "moving-transport" } })).id);
  await profile.saveServices(providerId, [(await prisma.service.findUniqueOrThrow({ where: { slug: "parcel-delivery" } })).id]);
  await profile.saveDescription(providerId, "Connection system test provider, deleted after the run.");
  await profile.saveContact(providerId, "255700000600", null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  slug = (await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).slug;
}, 120_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("choosing buttons", () => {
  it("booking buttons need their link; links are saved with the selection", async () => {
    expect(await profile.saveActions(providerId, ["CALL", "BOOK_RIDE"])).toEqual({ ok: false, error: "actionUnavailable" });
    expect(await profile.saveActions(providerId, ["CALL", "BOOK_RIDE", "MESSAGE", "REQUEST_QUOTE"], { rideUrl: "https://ride.example.com/haraka" })).toEqual({ ok: true });
    const pr = await prisma.providerProfile.findUniqueOrThrow({ where: { providerId } });
    expect(pr.rideUrl).toBe("https://ride.example.com/haraka");
    expect(pr.enabledActions).toEqual(["CALL", "BOOK_RIDE", "MESSAGE", "REQUEST_QUOTE"]);
  });

  it("the public page only exposes what's switched on", async () => {
    const p = await getPublicProfile(slug, null, null, "en");
    expect(p?.actions.map((a) => a.action)).toEqual(["CALL", "MESSAGE", "REQUEST_QUOTE", "BOOK_RIDE"]);
    expect(p?.actions.find((a) => a.action === "MESSAGE")?.href).toContain("I%20found%20you%20on%20NEXA");
    // Phase 7: Request Quote opens the in-app request form addressed to this provider.
    expect(p?.actions.find((a) => a.action === "REQUEST_QUOTE")?.href).toBe(`/requests/new?provider=${slug}`);
  });

  it("removing a ride link drops the Book Ride button", async () => {
    await profile.saveActions(providerId, ["CALL"], { rideUrl: null });
    expect((await prisma.providerProfile.findUniqueOrThrow({ where: { providerId } })).enabledActions).toEqual(["CALL"]);
  });
});

describe("tap analytics", () => {
  it("counts each person once per button per day", async () => {
    await profile.saveActions(providerId, ["CALL", "MESSAGE"]);
    const tap = (visitorId: string, action: "CALL" | "MESSAGE" = "CALL", at = now) =>
      recordConnect({ slug, action, source: "PROFILE", visitorId, viewer: null, now: at });
    expect(await tap("visitor-a")).toEqual({ recorded: true });
    expect(await tap("visitor-a")).toEqual({ recorded: false });
    expect(await tap("visitor-a", "MESSAGE")).toEqual({ recorded: true });
    expect(await tap("visitor-b")).toEqual({ recorded: true });
    expect(await tap("visitor-a", "CALL", new Date("2026-09-25T07:00:00Z"))).toEqual({ recorded: true });
    const stats = await connectStats(providerId, 30, new Date("2026-09-25T08:00:00Z"));
    expect(stats.byAction).toEqual({ CALL: 3, MESSAGE: 1 });
    expect(stats.total).toBe(4);
  });

  it("ignores buttons the provider doesn't offer, unknown providers, and its own staff and admins", async () => {
    expect(await recordConnect({ slug, action: "WEBSITE", source: "CARD", visitorId: "v", viewer: null, now })).toEqual({ recorded: false, reason: "notOffered" });
    expect(await recordConnect({ slug: "no-such-provider", action: "CALL", source: "CARD", visitorId: "v", viewer: null, now })).toEqual({ recorded: false, reason: "notFound" });
    expect(await recordConnect({ slug, action: "CALL", source: "CARD", visitorId: "o", viewer: { id: ownerId, role: "PROVIDER" }, now })).toEqual({ recorded: false, reason: "ownOrStaff" });
    expect(await recordConnect({ slug, action: "CALL", source: "CARD", visitorId: "a", viewer: { id: adminId, role: "ADMIN" }, now })).toEqual({ recorded: false, reason: "ownOrStaff" });
  });

  it("stores no visitor id, IP or account", async () => {
    const rows = await prisma.connectEvent.findMany({ where: { providerId } });
    const json = JSON.stringify(rows);
    expect(json).not.toContain("visitor-a");
    expect(json).not.toContain(ownerId);
    expect(Object.keys(rows[0]!).sort()).toEqual(["action", "createdAt", "day", "id", "providerId", "source", "visitorHash"]);
  });

  it("hidden providers don't record taps", async () => {
    await profile.unpublishProvider(providerId);
    expect(await recordConnect({ slug, action: "CALL", source: "CARD", visitorId: "late", viewer: null, now })).toEqual({ recorded: false, reason: "notFound" });
  });
});
