import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import * as verification from "@/lib/services/verification";
import * as reviews from "@/lib/services/reviews";
import { hit, reset, type Limit } from "@/lib/services/rateLimit";

// Phase 5 against the test database and the test branch's PRIVATE bucket.
const run = `v${Date.now().toString(36)}`;
const domain = ".trust.test.gobig.local";
let ownerId: string;
let otherProviderUserId: string;
let customerId: string;
let customer2Id: string;
let adminId: string;
let providerId: string;
let otherProviderId: string;
let identityLevelId: string;
let businessLevelId: string;

const user = (id: string, role: "CUSTOMER" | "PROVIDER" | "ADMIN") => ({ id, role, status: "ACTIVE" });
const png = () => sharp({ create: { width: 400, height: 300, channels: 3, background: "#888" } }).png().toBuffer();
const pdf = () => Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER" | "ADMIN") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}

async function liveProvider(userId: string, name: string) {
  const { providerId: id } = await profile.saveBusinessName(userId, `${name} ${run}`);
  await profile.saveCategory(id, (await prisma.category.findUniqueOrThrow({ where: { slug: "cleaning" } })).id);
  await profile.saveServices(id, [(await prisma.service.findUniqueOrThrow({ where: { slug: "house-cleaning" } })).id]);
  await profile.saveDescription(id, "Trust integration test provider, removed after the run.");
  await profile.saveContact(id, "255700000400", null);
  await profile.saveLocation(id, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: "sinza" } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(id, ["CALL"]);
  expect(await profile.publishProvider(id)).toEqual({ ok: true });
  return id;
}

async function cleanup() {
  const providers = await prisma.provider.findMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } }, select: { id: true } });
  const docs = await prisma.verificationDocument.findMany({ where: { request: { providerId: { in: providers.map((p) => p.id) } } }, select: { storageKey: true } });
  const { deletePrivateObject } = await import("@/lib/storage");
  for (const d of docs) await deletePrivateObject(d.storageKey).catch(() => undefined);
  await prisma.provider.deleteMany({ where: { id: { in: providers.map((p) => p.id) } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = await makeUser("Owner One", "PROVIDER");
  otherProviderUserId = await makeUser("Rival Two", "PROVIDER");
  customerId = await makeUser("Asha Juma", "CUSTOMER");
  customer2Id = await makeUser("Baraka Mwita", "CUSTOMER");
  adminId = await makeUser("Admin Three", "ADMIN");
  providerId = await liveProvider(ownerId, "Safi Cleaners");
  otherProviderId = await liveProvider(otherProviderUserId, "Rival Cleaners");
  identityLevelId = (await prisma.verificationLevel.findUniqueOrThrow({ where: { slug: "identity" } })).id;
  businessLevelId = (await prisma.verificationLevel.findUniqueOrThrow({ where: { slug: "business" } })).id;
}, 180_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("verification", () => {
  let requestId: string;

  it("a provider opens one request at a time", async () => {
    const r = await verification.startRequest(providerId, businessLevelId);
    expect(r.ok).toBe(true);
    requestId = (r as { requestId: string }).requestId;
    expect(await verification.startRequest(providerId, identityLevelId)).toEqual({ ok: false, error: "requestOpen" });
  });

  it("documents are validated and stored privately", async () => {
    expect(await verification.addDocument(providerId, requestId, "BUSINESS_LICENSE", Buffer.from("<script>alert(1)</script>"))).toEqual({ ok: false, error: "documentInvalid" });
    const a = await verification.addDocument(providerId, requestId, "BUSINESS_LICENSE", await png());
    expect(a.ok).toBe(true);
    const doc = await prisma.verificationDocument.findUniqueOrThrow({ where: { id: (a as { documentId: string }).documentId } });
    expect(doc.mimeType).toBe("image/jpeg"); // re-encoded, metadata stripped
    // Private bucket: anonymous read is refused.
    const anon = await fetch(`${process.env.S3_ENDPOINT}/verification-docs/${doc.storageKey}`);
    expect(anon.status).toBe(403);
  });

  it("another provider can't touch this request (IDOR)", async () => {
    expect((await verification.addDocument(otherProviderId, requestId, "OTHER", await png())).ok).toBe(false);
    const doc = await prisma.verificationDocument.findFirstOrThrow({ where: { requestId } });
    expect(await verification.removeDocument(otherProviderId, doc.id)).toEqual({ ok: false, error: "requestLocked" });
    expect(await verification.submitRequest(otherProviderId, requestId, null, otherProviderUserId)).toEqual({ ok: false, error: "requestLocked" });
  });

  it("can't submit until every required document is attached", async () => {
    expect(await verification.submitRequest(providerId, requestId, null, ownerId)).toEqual({ ok: false, error: "documentsMissing" });
    expect((await verification.addDocument(providerId, requestId, "TIN_CERTIFICATE", pdf())).ok).toBe(true);
    expect(await verification.submitRequest(providerId, requestId, "Licence renewed in March", ownerId)).toEqual({ ok: true });
    // Locked once submitted.
    expect(await verification.addDocument(providerId, requestId, "OTHER", await png())).toEqual({ ok: false, error: "requestLocked" });
  });

  it("a reviewer gets a working 60-second link and the view is logged", async () => {
    const doc = await prisma.verificationDocument.findFirstOrThrow({ where: { requestId } });
    const url = await verification.documentUrlForReviewer(adminId, doc.id);
    expect(url).toContain("X-Amz-Expires=60");
    expect((await fetch(url!)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "verification.document_viewed", entityId: requestId, actorId: adminId } })).toBe(1);
  });

  it("rejection needs a note; only one of two simultaneous decisions wins", async () => {
    expect(await verification.decide(adminId, requestId, "REJECT", "")).toEqual({ ok: false, error: "noteRequired" });
    const [a, b] = await Promise.all([verification.decide(adminId, requestId, "APPROVE", null), verification.decide(adminId, requestId, "REJECT", "Blurry")]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it("approval sets the badge; the provider's own profile writes can't", async () => {
    const r = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: requestId } });
    const p = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    if (r.status === "APPROVED") expect(p.verificationLevelId).toBe(businessLevelId);
    else expect(p.verificationLevelId).toBeNull();
    // None of the provider-facing service functions accept a verification field; the closest thing,
    // saving the profile, leaves it untouched.
    await profile.saveDescription(providerId, "Trust integration test provider, still being tested here.");
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).verificationLevelId).toBe(p.verificationLevelId);
  });

  it("revocation removes the badge and is audited", async () => {
    await prisma.provider.update({ where: { id: providerId }, data: { verificationLevelId: businessLevelId, verifiedAt: new Date() } });
    expect(await verification.revoke(adminId, providerId, "Licence expired")).toEqual({ ok: true });
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).verificationLevelId).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "verification.revoked", entityId: providerId } })).toBe(1);
  });

  it("the audit log is append-only in the database", async () => {
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { entityId: requestId } });
    await expect(prisma.auditLog.update({ where: { id: entry.id }, data: { action: "tampered" } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
  });
});

describe("reviews", () => {
  it("enforces who may review", async () => {
    expect((await reviews.reviewEligibility(user(customerId, "CUSTOMER"), providerId)).allowed).toBe(true);
    expect(await reviews.reviewEligibility(user(otherProviderUserId, "PROVIDER"), providerId)).toEqual({ allowed: false, reason: "role" });
    expect(await reviews.reviewEligibility(user(adminId, "ADMIN"), providerId)).toEqual({ allowed: false, reason: "role" });
    expect(await reviews.reviewEligibility(null, providerId)).toEqual({ allowed: false, reason: "login" });
    // A customer account that is also a member of the business can't review it.
    await prisma.providerMember.create({ data: { providerId, userId: customer2Id, role: "STAFF" } });
    expect(await reviews.reviewEligibility(user(customer2Id, "CUSTOMER"), providerId)).toEqual({ allowed: false, reason: "ownBusiness" });
    await prisma.providerMember.deleteMany({ where: { providerId, userId: customer2Id } });
  });

  it("one review per customer; editing replaces it and the rating follows", async () => {
    expect((await reviews.upsertReview(user(customerId, "CUSTOMER"), providerId, { rating: 5, body: "Spotless, arrived on time." })).ok).toBe(true);
    expect((await reviews.upsertReview(user(customer2Id, "CUSTOMER"), providerId, { rating: 2, body: "Missed the kitchen entirely." })).ok).toBe(true);
    let p = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    expect([p.ratingCount, p.ratingAvg]).toEqual([2, 3.5]);
    await reviews.upsertReview(user(customerId, "CUSTOMER"), providerId, { rating: 4, body: "Good, one window missed." });
    p = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    expect([p.ratingCount, p.ratingAvg]).toEqual([2, 3]);
    expect(await prisma.review.count({ where: { providerId, authorId: customerId } })).toBe(1);
  });

  it("only the provider's owner can reply, and a reply never changes the review", async () => {
    const review = await prisma.review.findFirstOrThrow({ where: { providerId, authorId: customer2Id } });
    expect(await reviews.respond(otherProviderUserId, review.id, "Not our customer")).toEqual({ ok: false, error: "reviewNotFound" });
    expect(await reviews.respond(customerId, review.id, "Hijack")).toEqual({ ok: false, error: "reviewNotFound" });
    expect(await reviews.respond(ownerId, review.id, "Sorry — we'll come back to finish the kitchen.")).toEqual({ ok: true });
    const after = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect([after.rating, after.body]).toEqual([2, "Missed the kitchen entirely."]);
  });

  it("reports: not your own, not twice", async () => {
    const review = await prisma.review.findFirstOrThrow({ where: { providerId, authorId: customer2Id } });
    expect(await reviews.reportReview(customer2Id, review.id, "SPAM", null)).toEqual({ ok: false, error: "cannotReportOwn" });
    expect(await reviews.reportReview(ownerId, review.id, "FAKE", "Never visited")).toEqual({ ok: true });
    expect(await reviews.reportReview(ownerId, review.id, "FAKE", null)).toEqual({ ok: false, error: "alreadyReported" });
  });

  it("hiding a review removes it from the rating and the public list; editing can't un-hide it", async () => {
    const review = await prisma.review.findFirstOrThrow({ where: { providerId, authorId: customer2Id } });
    expect(await reviews.moderate(adminId, review.id, "HIDE", "Confirmed fake")).toEqual({ ok: true });
    let p = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    expect([p.ratingCount, p.ratingAvg]).toEqual([1, 4]);
    expect((await reviews.publicReviews(providerId)).reviews.map((r) => r.id)).not.toContain(review.id);
    await reviews.upsertReview(user(customer2Id, "CUSTOMER"), providerId, { rating: 5, body: "Edited to sneak back in!" });
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("HIDDEN");
    p = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    expect(p.ratingCount).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "review.hidden", entityId: review.id } })).toBe(1);
    // Hiding closed its reports, so it left the queue — but admins can still find it to restore.
    expect((await reviews.moderationQueue()).map((r) => r.id)).not.toContain(review.id);
    expect((await reviews.recentlyHiddenReviews(100)).map((r) => r.id)).toContain(review.id);
  });

  it("public review data carries no reviewer contact details", async () => {
    const json = JSON.stringify(await reviews.publicReviews(providerId));
    expect(json).toContain("Asha J.");
    expect(json).not.toContain(domain);
    expect(json).not.toContain("Juma");
  });
});

describe("rate limiter", () => {
  const limit: Limit = { name: `test-${run}`, max: 3, windowSec: 60 };
  it("allows up to the limit, then refuses, and resets", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => hit(limit, "subject")));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false });
    await reset(limit, "subject");
    expect((await hit(limit, "subject")).ok).toBe(true);
    await reset(limit, "subject");
  });
  it("stores no raw subject", async () => {
    await hit(limit, "someone@example.com");
    const rows = await prisma.rateLimit.findMany({ where: { key: { startsWith: `test-${run}` } } });
    expect(JSON.stringify(rows)).not.toContain("someone@example.com");
    await reset(limit, "someone@example.com");
  });
});
