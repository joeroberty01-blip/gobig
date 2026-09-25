import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import * as requests from "@/lib/services/requests";
import * as reviews from "@/lib/services/reviews";
import { unreadCount } from "@/lib/services/notifications";
import { getPlatformSettings, savePlatformSettings } from "@/lib/services/platformSettings";

// Phase 7 service requests against the test branch (and its private bucket, for photos).
const run = `r${Date.now().toString(36)}`;
const domain = ".requests.test.gobig.local";
const now = new Date();

let customerId: string;
let customer2Id: string;
let customer3Id: string;
let ownerAId: string;
let ownerBId: string;
let ownerCId: string;
let providerA: string;
let providerB: string;
let providerC: string;
let serviceId: string;
let categoryId: string;
let locationId: string;
let requestId: string;

const customer = (id: string) => ({ id, role: "CUSTOMER", status: "ACTIVE" });
const png = () => sharp({ create: { width: 300, height: 200, channels: 3, background: "#4a6" } }).png().toBuffer();

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER", phone?: string) {
  return (
    await prisma.user.create({
      data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, phone: phone ?? null, passwordHash: "x", role },
    })
  ).id;
}

async function liveProvider(userId: string, name: string, serviceSlug: string) {
  const { providerId } = await profile.saveBusinessName(userId, `${name} ${run}`);
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: serviceSlug } });
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.saveDescription(providerId, "Requests integration test provider, removed after the run.");
  await profile.saveContact(providerId, "255700000700", null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL", "REQUEST_QUOTE"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  return providerId;
}

const base = (): requests.NewRequest => ({
  serviceId,
  categoryId,
  description: "Mende wengi jikoni, nahitaji kupuliza dawa nyumba nzima.",
  locationId,
  addressText: "Mtaa wa Uhuru, nyumba namba 12",
  preferredDate: null,
  preferredTime: 9 * 60,
  budgetMin: 50_000,
  budgetMax: 80_000,
  contactPreference: "CALL",
  targetProviderSlug: null,
});

async function cleanup() {
  const photos = await prisma.requestPhoto.findMany({ where: { request: { customer: { email: { endsWith: domain } } } }, select: { storageKey: true } });
  const { deletePrivateObject } = await import("@/lib/storage");
  for (const p of photos) await deletePrivateObject(p.storageKey).catch(() => undefined);
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  customerId = await makeUser("Neema Kweka", "CUSTOMER");
  customer2Id = await makeUser("Other Customer", "CUSTOMER");
  customer3Id = await makeUser("Busy Customer", "CUSTOMER");
  ownerAId = await makeUser("Owner A", "PROVIDER");
  ownerBId = await makeUser("Owner B", "PROVIDER");
  ownerCId = await makeUser("Owner C", "PROVIDER");
  providerA = await liveProvider(ownerAId, "Pest Away", "pest-control");
  providerB = await liveProvider(ownerBId, "Dawa Safi", "pest-control");
  providerC = await liveProvider(ownerCId, "Only Laundry", "laundry");
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "pest-control" } });
  serviceId = service.id;
  categoryId = service.categoryId;
  locationId = (await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } })).id;
}, 180_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("posting a request", () => {
  it("only active customers can post, and a service or category is required", async () => {
    expect(await requests.createRequest({ id: ownerAId, role: "PROVIDER", status: "ACTIVE" }, base())).toEqual({ ok: false, error: "notAllowed" });
    expect(await requests.createRequest({ id: customerId, role: "CUSTOMER", status: "SUSPENDED" }, base())).toEqual({ ok: false, error: "notAllowed" });
    expect(await requests.createRequest(customer(customerId), { ...base(), serviceId: null, categoryId: null })).toEqual({ ok: false, error: "serviceRequired" });
    expect(await requests.createRequest(customer(customerId), { ...base(), serviceId: "nope-not-an-id" })).toEqual({ ok: false, error: "serviceRequired" });
    expect(await requests.createRequest(customer(customerId), { ...base(), locationId: "nope-not-an-id" })).toEqual({ ok: false, error: "locationRequired" });
  });

  it("is matched to live providers offering the service in the area — not to others", async () => {
    const r = await requests.createRequest(customer(customerId), base(), now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    requestId = r.requestId;
    const matched = (await prisma.requestMatch.findMany({ where: { requestId }, select: { providerId: true } })).map((m) => m.providerId);
    expect(matched).toEqual(expect.arrayContaining([providerA, providerB]));
    expect(matched).not.toContain(providerC);
    expect(matched.length).toBeLessThanOrEqual(requests.MAX_MATCHES);
  });

  it("matched providers are notified; unmatched ones are not", async () => {
    const types = async (userId: string) => (await prisma.notification.findMany({ where: { userId }, select: { type: true } })).map((n) => n.type);
    expect(await types(ownerAId)).toContain("REQUEST_NEW");
    expect(await types(ownerBId)).toContain("REQUEST_NEW");
    expect(await types(ownerCId)).not.toContain("REQUEST_NEW");
  });

  it("a direct request goes to that provider only", async () => {
    const slugA = (await prisma.provider.findUniqueOrThrow({ where: { id: providerA } })).slug;
    const r = await requests.createRequest(customer(customer2Id), { ...base(), targetProviderSlug: slugA });
    expect(r).toMatchObject({ ok: true, matched: 1 });
    expect(await requests.createRequest(customer(customer2Id), { ...base(), targetProviderSlug: "no-such-provider-xyz" })).toEqual({ ok: false, error: "providerUnavailable" });
  });

  it("caps open requests per customer", async () => {
    for (let i = 0; i < requests.MAX_OPEN_REQUESTS; i++) {
      expect((await requests.createRequest(customer(customer3Id), { ...base(), targetProviderSlug: null })).ok).toBe(true);
    }
    expect(await requests.createRequest(customer(customer3Id), base())).toEqual({ ok: false, error: "tooManyOpen" });
  });

  it("the open-request cap comes from Admin → Settings (Phase 12)", async () => {
    const before = await getPlatformSettings({ fresh: true });
    await savePlatformSettings(customer3Id, { ...before, maxOpenRequests: requests.MAX_OPEN_REQUESTS + 1 });
    try {
      expect((await requests.createRequest(customer(customer3Id), base())).ok).toBe(true);
      expect(await requests.createRequest(customer(customer3Id), base())).toEqual({ ok: false, error: "tooManyOpen" });
      expect(await prisma.auditLog.count({ where: { action: "platform.settings_saved", actorId: customer3Id } })).toBe(1);
    } finally {
      await savePlatformSettings(customer3Id, before);
    }
  });
});

describe("who can see what", () => {
  it("an unmatched provider and another customer get nothing", async () => {
    expect(await requests.providerRequest(providerC, requestId)).toBeNull();
    expect(await requests.customerRequest(customer2Id, requestId)).toBeNull();
    expect(await requests.expressInterest(providerC, requestId)).toEqual({ ok: false, error: "requestClosed" });
    expect(await requests.sendQuote(providerC, requestId, { amount: 1000, note: null, validUntil: null })).toEqual({ ok: false, error: "requestClosed" });
  });

  it("before acceptance, matched providers see no address or contact details, and a short customer name", async () => {
    const v = await requests.providerRequest(providerA, requestId);
    expect(v).not.toBeNull();
    expect(v!.request.addressText).toBeNull();
    expect(v!.request.customerContact).toBeNull();
    expect(v!.request.customerName).toBe("Neema K.");
    expect(JSON.stringify(v)).not.toContain("Uhuru");
    expect(JSON.stringify(v)).not.toContain(domain);
  });
});

describe("responding", () => {
  it("interest and quotes notify the customer and move the match along", async () => {
    const before = await unreadCount(customerId);
    expect(await requests.expressInterest(providerA, requestId)).toEqual({ ok: true });
    expect(await requests.sendQuote(providerA, requestId, { amount: 70_000, note: "Dawa + ufundi", validUntil: null })).toEqual({ ok: true });
    expect(await requests.sendQuote(providerA, requestId, { amount: 65_000, note: "Bei mpya", validUntil: null })).toEqual({ ok: true });
    expect(await requests.sendQuote(providerB, requestId, { amount: 90_000, note: null, validUntil: null })).toEqual({ ok: true });
    expect(await unreadCount(customerId)).toBe(before + 4);
    const quotes = await prisma.quote.findMany({ where: { requestId }, orderBy: { amount: "asc" } });
    expect(quotes.map((q) => q.amount)).toEqual([65_000, 90_000]); // revised, not duplicated
    const a = await prisma.requestMatch.findUniqueOrThrow({ where: { requestId_providerId: { requestId, providerId: providerA } } });
    expect(a.status).toBe("QUOTED");
    expect(a.firstResponseAt).not.toBeNull();
  });

  it("messages: sides are derived from who is sending; outsiders are refused", async () => {
    const a = await prisma.requestMatch.findUniqueOrThrow({ where: { requestId_providerId: { requestId, providerId: providerA } } });
    expect(await requests.sendMessage(customerId, a.id, "Mnaweza kuja Jumamosi?")).toEqual({ ok: true });
    expect(await requests.sendMessage(ownerAId, a.id, "Ndiyo, saa tatu asubuhi.")).toEqual({ ok: true });
    // Another provider's owner and another customer can't post into A's conversation.
    expect(await requests.sendMessage(ownerBId, a.id, "Mimi ni nafuu zaidi")).toEqual({ ok: false, error: "requestNotFound" });
    expect(await requests.sendMessage(customer2Id, a.id, "Hi")).toEqual({ ok: false, error: "requestNotFound" });
    const msgs = await prisma.message.findMany({ where: { matchId: a.id }, orderBy: { createdAt: "asc" } });
    expect(msgs.map((m) => m.senderRole)).toEqual(["CUSTOMER", "PROVIDER"]);
    expect((await prisma.notification.findMany({ where: { userId: ownerAId, type: "MESSAGE_NEW" } })).length).toBe(1);
  });

  it("opening the request marks only the viewer's notifications and incoming messages read", async () => {
    await requests.markRequestSeen(customerId, requestId);
    expect(await prisma.notification.count({ where: { userId: customerId, readAt: null, data: { path: ["requestId"], equals: requestId } } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: ownerAId, readAt: null } })).toBeGreaterThan(0);
    const a = await prisma.requestMatch.findUniqueOrThrow({ where: { requestId_providerId: { requestId, providerId: providerA } } });
    expect(await prisma.message.count({ where: { matchId: a.id, senderRole: "PROVIDER", readAt: null } })).toBe(0);
    expect(await prisma.message.count({ where: { matchId: a.id, senderRole: "CUSTOMER", readAt: null } })).toBe(1);
  });
});

describe("accepting", () => {
  it("another customer can't accept; the owner can accept only a provider who responded", async () => {
    expect(await requests.acceptProvider(customer2Id, requestId, providerA)).toEqual({ ok: false, error: "requestNotFound" });
    expect(await requests.acceptProvider(customerId, requestId, providerC)).toEqual({ ok: false, error: "requestNotFound" });
  });

  it("accepting closes the request for everyone else and reveals contact details to the chosen provider only", async () => {
    expect(await requests.acceptProvider(customerId, requestId, providerA)).toEqual({ ok: true });
    const r = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { matches: true, quotes: true } });
    expect(r.status).toBe("ACCEPTED");
    expect(r.acceptedProviderId).toBe(providerA);
    expect(r.matches.find((m) => m.providerId === providerA)?.status).toBe("ACCEPTED");
    expect(r.matches.find((m) => m.providerId === providerB)?.status).toBe("NOT_SELECTED");
    expect(r.quotes.find((q) => q.providerId === providerA)?.status).toBe("ACCEPTED");
    expect(r.quotes.find((q) => q.providerId === providerB)?.status).toBe("DECLINED");

    const a = await requests.providerRequest(providerA, requestId);
    expect(a!.request.addressText).toBe("Mtaa wa Uhuru, nyumba namba 12");
    expect(a!.request.customerContact?.email).toContain(domain);
    const b = await requests.providerRequest(providerB, requestId);
    expect(b!.request.addressText).toBeNull();
    expect(b!.request.customerContact).toBeNull();

    expect(await prisma.notification.count({ where: { userId: ownerAId, type: "QUOTE_ACCEPTED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ownerBId, type: "REQUEST_NOT_SELECTED" } })).toBe(1);
  });

  it("the customer sees the chosen provider's numbers, not the others'", async () => {
    const v = await requests.customerRequest(customerId, requestId);
    expect(v!.matches.find((m) => m.provider.id === providerA)?.provider.profile?.phone).toBe("255700000700");
    expect(v!.matches.find((m) => m.provider.id === providerB)?.provider.profile?.phone).toBeNull();
  });

  it("after acceptance nobody else can respond, and a second acceptance fails", async () => {
    expect(await requests.sendQuote(providerB, requestId, { amount: 10_000, note: null, validUntil: null })).toEqual({ ok: false, error: "requestClosed" });
    const b = await prisma.requestMatch.findUniqueOrThrow({ where: { requestId_providerId: { requestId, providerId: providerB } } });
    expect(await requests.sendMessage(ownerBId, b.id, "Bado nipo")).toEqual({ ok: false, error: "requestClosed" });
    expect(await requests.acceptProvider(customerId, requestId, providerB)).toEqual({ ok: false, error: "requestNotFound" });
  });

  it("two simultaneous acceptances: exactly one wins", async () => {
    const r = await requests.createRequest(customer(customer2Id), base());
    if (!r.ok) throw new Error("create failed");
    await requests.expressInterest(providerA, r.requestId);
    await requests.expressInterest(providerB, r.requestId);
    const results = await Promise.all([
      requests.acceptProvider(customer2Id, r.requestId, providerA),
      requests.acceptProvider(customer2Id, r.requestId, providerB),
    ]);
    expect(results.filter((x) => x.ok).length).toBe(1);
    const accepted = await prisma.requestMatch.count({ where: { requestId: r.requestId, status: "ACCEPTED" } });
    expect(accepted).toBe(1);
  });
});

describe("completing and reviews", () => {
  it("only the owner completes an accepted request; the review is then marked as a verified job", async () => {
    expect(await requests.completeRequest(customer2Id, requestId)).toEqual({ ok: false, error: "requestClosed" });
    const reviewBefore = await reviews.upsertReview(customer(customerId), providerA, { rating: 5, body: "Walifika mapema na kazi nzuri sana." });
    expect(reviewBefore.ok).toBe(true);
    expect((await prisma.review.findFirstOrThrow({ where: { authorId: customerId, providerId: providerA } })).verifiedJob).toBe(false);

    expect(await requests.completeRequest(customerId, requestId)).toEqual({ ok: true });
    expect(await prisma.notification.count({ where: { userId: ownerAId, type: "REQUEST_COMPLETED" } })).toBe(1);
    await reviews.upsertReview(customer(customerId), providerA, { rating: 5, body: "Walifika mapema na kazi nzuri sana!" });
    expect((await prisma.review.findFirstOrThrow({ where: { authorId: customerId, providerId: providerA } })).verifiedJob).toBe(true);
    // A provider that wasn't chosen gets no verified-job flag from this request.
    await reviews.upsertReview(customer(customerId), providerB, { rating: 3, body: "Walijibu haraka lakini bei juu." });
    expect((await prisma.review.findFirstOrThrow({ where: { authorId: customerId, providerId: providerB } })).verifiedJob).toBe(false);
    expect(await requests.hasCompletedJob(customerId, providerA)).toBe(true);
  });

  it("the public review list carries the flag", async () => {
    const list = await reviews.publicReviews(providerA);
    expect(list.reviews.find((r) => r.authorName === "Neema K.")?.verifiedJob).toBe(true);
  });
});

describe("expiry and cancellation", () => {
  it("an expired request can't be answered", async () => {
    const r = await requests.createRequest(customer(customer2Id), base());
    if (!r.ok) throw new Error("create failed");
    await prisma.serviceRequest.update({ where: { id: r.requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await requests.expressInterest(providerA, r.requestId)).toEqual({ ok: false, error: "requestClosed" });
    expect((await requests.customerRequest(customer2Id, r.requestId))!.effective).toBe("EXPIRED");
  });

  it("cancelling notifies matched providers and closes conversations", async () => {
    const r = await requests.createRequest(customer(customer2Id), base());
    if (!r.ok) throw new Error("create failed");
    expect(await requests.cancelRequest(customerId, r.requestId)).toEqual({ ok: false, error: "requestClosed" });
    expect(await requests.cancelRequest(customer2Id, r.requestId)).toEqual({ ok: true });
    expect(await prisma.notification.count({ where: { userId: ownerBId, type: "REQUEST_CANCELLED" } })).toBeGreaterThanOrEqual(1);
    const m = await prisma.requestMatch.findFirstOrThrow({ where: { requestId: r.requestId, providerId: providerA } });
    expect(await requests.sendMessage(customer2Id, m.id, "Samahani")).toEqual({ ok: false, error: "requestClosed" });
  });
});

describe("photos (private bucket)", () => {
  let photoId: string;
  let openRequestId: string;

  it("the owner can attach images to an open request; others can't", async () => {
    const r = await requests.createRequest(customer(customer2Id), base());
    if (!r.ok) throw new Error("create failed");
    openRequestId = r.requestId;
    expect(await requests.addRequestPhoto(customerId, openRequestId, await png())).toEqual({ ok: false, error: "requestNotFound" });
    expect(await requests.addRequestPhoto(customer2Id, openRequestId, Buffer.from("not an image"))).toEqual({ ok: false, error: "imageInvalid" });
    const added = await requests.addRequestPhoto(customer2Id, openRequestId, await png());
    expect(added.ok).toBe(true);
    if (added.ok) photoId = added.photoId;
  }, 60_000);

  it("signed URLs go to the customer and matched providers only", async () => {
    expect(await requests.requestPhotoUrl({ id: customer2Id, role: "CUSTOMER" }, photoId)).toMatch(/^https:\/\//);
    expect(await requests.requestPhotoUrl({ id: ownerAId, role: "PROVIDER" }, photoId)).toMatch(/^https:\/\//);
    expect(await requests.requestPhotoUrl({ id: ownerCId, role: "PROVIDER" }, photoId)).toBeNull();
    expect(await requests.requestPhotoUrl({ id: customerId, role: "CUSTOMER" }, photoId)).toBeNull();
  });

  it("at most five photos", async () => {
    for (let i = 0; i < requests.MAX_REQUEST_PHOTOS - 1; i++) expect((await requests.addRequestPhoto(customer2Id, openRequestId, await png())).ok).toBe(true);
    expect(await requests.addRequestPhoto(customer2Id, openRequestId, await png())).toEqual({ ok: false, error: "tooManyPhotos" });
  }, 120_000);
});

describe("database rules", () => {
  it("rejects out-of-range values even if the app were bypassed", async () => {
    await expect(prisma.serviceRequest.update({ where: { id: requestId }, data: { budgetMin: 100, budgetMax: 50 } })).rejects.toThrow();
    await expect(prisma.serviceRequest.update({ where: { id: requestId }, data: { preferredTime: 2000 } })).rejects.toThrow();
    await expect(prisma.quote.updateMany({ where: { requestId }, data: { amount: 0 } })).rejects.toThrow();
    // Only one accepted quote per request.
    await expect(prisma.quote.updateMany({ where: { requestId }, data: { status: "ACCEPTED" } })).rejects.toThrow();
    // An accepted request must record when.
    await expect(prisma.serviceRequest.update({ where: { id: requestId }, data: { acceptedAt: null } })).rejects.toThrow();
  });

  it("regression: deleting the accepted provider keeps the customer's request history", async () => {
    await prisma.provider.delete({ where: { id: providerA } });
    const r = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(r.status).toBe("COMPLETED");
    expect(r.acceptedProviderId).toBeNull();
    expect(r.acceptedAt).not.toBeNull();
  });
});
