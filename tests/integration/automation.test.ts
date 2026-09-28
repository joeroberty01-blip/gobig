import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import { autoHideReportedReviews, remindUnansweredRequests } from "@/lib/jobs/automation";
import { getPlatformSettings, savePlatformSettings, _clearPlatformSettingsCache } from "@/lib/services/platformSettings";
import * as trips from "@/lib/services/trips";

// Phase 17 automation rules and settings switches against the test branch.
const run = `a${Date.now().toString(36)}`;
const domain = ".automation.test.gobig.local";

let providerId: string;
let ownerId: string;
const users: string[] = [];

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = await makeUser("Automation Owner", "PROVIDER");
  ({ providerId } = await profile.saveBusinessName(ownerId, `Automation Biz ${run}`));
  for (let i = 0; i < 3; i++) users.push(await makeUser(`Reporter ${i}`, "CUSTOMER"));
}, 120_000);

afterAll(cleanup);

describe("auto-hide reported reviews", () => {
  it("hides only at the threshold, marks the reports handled and audits it", async () => {
    const review = await prisma.review.create({ data: { providerId, authorId: users[0]!, rating: 1, body: "Spam spam spam spam" } });
    for (const u of users.slice(1)) await prisma.reviewReport.create({ data: { reviewId: review.id, reporterId: u, reason: "SPAM" } });
    expect(await autoHideReportedReviews(0)).toBe(0); // rule off
    expect(await autoHideReportedReviews(3)).toBe(0); // only 2 reports
    const hidden = await autoHideReportedReviews(2);
    expect(hidden).toBeGreaterThanOrEqual(1);
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("HIDDEN");
    expect(await prisma.reviewReport.count({ where: { reviewId: review.id, status: "OPEN" } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { action: "review.auto_hidden", entityId: review.id } });
    expect(log).toMatchObject({ actorId: null });
  });
});

describe("unanswered request reminders", () => {
  it("reminds a matched business once, only after the wait and while the request is open", async () => {
    const location = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const request = await prisma.serviceRequest.create({
      data: { customerId: users[0]!, categoryId: category.id, description: "Automation test request, removed after the run.", locationId: location.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const match = await prisma.requestMatch.create({ data: { requestId: request.id, providerId, notifiedAt: new Date(Date.now() - 5 * 3_600_000) } });
    // Other rows may exist in the shared test database, so only this match is checked.
    const reminded = async () => (await prisma.requestMatch.findUniqueOrThrow({ where: { id: match.id } })).remindedAt;
    expect(await remindUnansweredRequests(0)).toBe(0); // rule off
    await remindUnansweredRequests(6); // not waited long enough
    expect(await reminded()).toBeNull();
    await remindUnansweredRequests(4);
    expect((await prisma.requestMatch.findUniqueOrThrow({ where: { id: match.id } })).remindedAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { userId: ownerId, type: "REQUEST_REMINDER" } })).toBe(1);
    await remindUnansweredRequests(4);
    expect(await prisma.notification.count({ where: { userId: ownerId, type: "REQUEST_REMINDER" } })).toBe(1); // never twice
  });
});

describe("drivers and switches", () => {
  it("takes silent drivers offline", async () => {
    await prisma.driverProfile.create({
      data: { providerId, vehicleType: "BODA", vehicleModel: "TVS", vehicleColor: "Red", plateNumber: "MC 1 AAA", baseFare: 1000, perKmFare: 500, online: true, lastLat: -6.8, lastLng: 39.27, lastSeenAt: new Date(Date.now() - 60 * 60_000) },
    });
    expect(await trips.autoOfflineDrivers(30)).toBeGreaterThanOrEqual(1);
    expect(await trips.getDriverProfile(providerId)).toMatchObject({ online: false, lastLat: null, lastLng: null });
  });

  it("switching rides off stops new ride requests", async () => {
    const before = await getPlatformSettings({ fresh: true });
    try {
      await savePlatformSettings(ownerId, { ...before, ridesEnabled: false });
      _clearPlatformSettingsCache();
      const r = await trips.requestTrip({ id: users[1]!, role: "CUSTOMER", status: "ACTIVE" }, { kind: "RIDE", pickup: { lat: -6.819, lng: 39.274 }, dropoff: { lat: -6.77, lng: 39.245 }, vehicleType: "BODA" });
      expect(r).toEqual({ ok: false, error: "unavailable" });
    } finally {
      await savePlatformSettings(ownerId, before);
      _clearPlatformSettingsCache();
    }
  });
});
