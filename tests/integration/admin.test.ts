import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import * as requests from "@/lib/services/requests";
import * as people from "@/lib/services/admin/people";
import * as catalog from "@/lib/services/admin/catalog";
import * as oversight from "@/lib/services/admin/oversight";
import { auditLog, platformAnalytics } from "@/lib/services/admin/insights";
import { searchProviders } from "@/lib/services/discovery";
import { parseSearchParams } from "@/lib/discovery/query";

// Phase 12 against the test branch: admin powers, their limits, and the audit trail.
const run = `m${Date.now().toString(36)}`;
const domain = ".admin.test.gobig.local";
const SERVICE = "tv-sound-repair";
const AREA = "keko";

let superId: string;
let adminId: string;
let admin2Id: string;
let customerId: string;
let customer2Id: string;
let ownerId: string;
let otherOwnerId: string;
let providerId: string;
let requestId: string;
let matchId: string;

const actor = (id: string, role: "ADMIN" | "SUPER_ADMIN") => ({ id, role });
const customer = (id: string) => ({ id, role: "CUSTOMER", status: "ACTIVE" });

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
  await prisma.announcement.deleteMany({ where: { titleEn: { contains: run } } });
  // Test-branch data only: the temporary catalogue items are removed outright.
  await prisma.service.deleteMany({ where: { slug: { startsWith: `test-svc-${run}` } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: `test-cat-${run}` } } });
}

beforeAll(async () => {
  await cleanup();
  superId = await makeUser("Super One", "SUPER_ADMIN");
  adminId = await makeUser("Admin One", "ADMIN");
  admin2Id = await makeUser("Admin Two", "ADMIN");
  customerId = await makeUser("Cust One", "CUSTOMER");
  customer2Id = await makeUser("Cust Two", "CUSTOMER");
  ownerId = await makeUser("Owner One", "PROVIDER");
  otherOwnerId = await makeUser("Owner Two", "PROVIDER");
  ({ providerId } = await profile.saveBusinessName(ownerId, `Redio Fundi ${run}`));
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: SERVICE } });
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.saveDescription(providerId, "Admin integration test provider, removed after the run.");
  await profile.saveContact(providerId, "255700000980", null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: AREA } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  const slug = (await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).slug;
  const location = await prisma.location.findUniqueOrThrow({ where: { slug: AREA } });
  const r = await requests.createRequest(customer(customerId), {
    serviceId: service.id,
    categoryId: service.categoryId,
    description: "Redio haitoi sauti, nahitaji fundi.",
    locationId: location.id,
    addressText: null,
    preferredDate: null,
    preferredTime: null,
    budgetMin: null,
    budgetMax: null,
    contactPreference: "IN_APP",
    targetProviderSlug: slug,
  });
  if (!r.ok) throw new Error(r.error);
  requestId = r.requestId;
  matchId = (await prisma.requestMatch.findFirstOrThrow({ where: { requestId } })).id;
  await requests.sendMessage(customerId, matchId, "Unaweza kuja leo?");
}, 180_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("accounts", () => {
  it("nobody changes their own status; only a super admin can change an admin", async () => {
    expect(await people.setUserStatus(actor(adminId, "ADMIN"), adminId, "SUSPENDED", "test")).toEqual({ ok: false, error: "cannotSelf" });
    expect(await people.setUserStatus(actor(adminId, "ADMIN"), admin2Id, "SUSPENDED", "test")).toEqual({ ok: false, error: "superAdminOnly" });
    expect(await people.setUserStatus(actor(superId, "SUPER_ADMIN"), admin2Id, "SUSPENDED", "role review")).toEqual({ ok: true });
    expect(await people.setUserStatus(actor(superId, "SUPER_ADMIN"), admin2Id, "ACTIVE", "done")).toEqual({ ok: true });
  });

  it("suspending a customer is recorded with the reason", async () => {
    expect(await people.setUserStatus(actor(adminId, "ADMIN"), customer2Id, "SUSPENDED", "spam requests")).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer2Id } })).status).toBe("SUSPENDED");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: customer2Id, action: "user.suspended" } });
    expect(log).toMatchObject({ actorId: adminId, metadata: { reason: "spam requests" } });
    // A suspended customer can't post requests.
    const d = await people.userDetail(customer2Id);
    expect(d?.history[0]?.action).toBe("user.suspended");
    await people.setUserStatus(actor(adminId, "ADMIN"), customer2Id, "ACTIVE", "appeal accepted");
  });

  it("search finds users by name, email or phone digits", async () => {
    const r = await people.searchUsers({ q: `cust.one-${run}`, role: null, status: null, page: 1 });
    expect(r.rows.map((u) => u.id)).toContain(customerId);
    expect((await people.searchUsers({ q: "", role: "SUPER_ADMIN", status: null, page: 1 })).rows.every((u) => u.role === "SUPER_ADMIN")).toBe(true);
  });
});

describe("provider listings", () => {
  const inSearch = async () =>
    (await searchProviders({ ...parseSearchParams({}), service: SERVICE, area: AREA })).rankedIds.includes(providerId);

  it("a suspended listing disappears and the provider can't republish it", async () => {
    expect(await inSearch()).toBe(true);
    expect(await people.setProviderListing(actor(adminId, "ADMIN"), providerId, "suspend", "fake reviews")).toMatchObject({ ok: true, status: "SUSPENDED" });
    expect(await inSearch()).toBe(false);
    expect(await profile.publishProvider(providerId)).toEqual({ ok: false, error: "notAllowed" });
  });

  it("reinstating a complete profile puts it straight back", async () => {
    expect(await people.setProviderListing(actor(adminId, "ADMIN"), providerId, "reinstate", "cleared")).toMatchObject({ ok: true, status: "ACTIVE" });
    expect(await inSearch()).toBe(true);
    expect(await people.setProviderListing(actor(adminId, "ADMIN"), providerId, "reinstate", "again")).toEqual({ ok: false, error: "notAllowed" });
  });

  it("SEC-011: suspending the owner's account hides the listing; reactivating brings it back", async () => {
    expect(await people.setUserStatus(actor(adminId, "ADMIN"), ownerId, "SUSPENDED", "scam reports")).toEqual({ ok: true });
    expect(await inSearch()).toBe(false);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: providerId, action: "provider.suspended" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })).metadata).toMatchObject({ cause: "account" });
    expect(await people.setUserStatus(actor(adminId, "ADMIN"), ownerId, "ACTIVE", "appeal accepted")).toEqual({ ok: true });
    expect(await inSearch()).toBe(true);
  });

  it("SEC-011: a listing suspended on its own stays suspended when the account comes back", async () => {
    await people.setProviderListing(actor(adminId, "ADMIN"), providerId, "suspend", "fake photos");
    await people.setUserStatus(actor(adminId, "ADMIN"), ownerId, "SUSPENDED", "also the account");
    await people.setUserStatus(actor(adminId, "ADMIN"), ownerId, "ACTIVE", "account cleared");
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).status).toBe("SUSPENDED");
    expect(await people.setProviderListing(actor(adminId, "ADMIN"), providerId, "reinstate", "photos fixed")).toMatchObject({ ok: true, status: "ACTIVE" });
  });
});

describe("catalogue & locations", () => {
  let catId: string;
  let svcId: string;

  it("new items get a stable web address that survives renaming", async () => {
    // Top-level, so it never changes counts other suites make of the seeded subcategories.
    const c = await catalog.saveCategory(adminId, null, { nameEn: `Test Cat ${run}`, nameSw: `Kundi ${run}`, icon: null, sortOrder: 99, isActive: false, parentId: null });
    if (!c.ok) throw new Error(c.error);
    catId = c.id;
    const s = await catalog.saveService(adminId, null, { categoryId: catId, nameEn: `Test Svc ${run}`, nameSw: `Huduma ${run}`, keywords: ["abc"], sortOrder: 0, isActive: true });
    if (!s.ok) throw new Error(s.error);
    svcId = s.id;
    const before = await prisma.service.findUniqueOrThrow({ where: { id: svcId } });
    expect(before.slug).toBe(`test-svc-${run}`);
    await catalog.saveService(adminId, svcId, { categoryId: catId, nameEn: "Renamed", nameSw: "Jina jipya", keywords: [], sortOrder: 0, isActive: false });
    expect((await prisma.service.findUniqueOrThrow({ where: { id: svcId } })).slug).toBe(before.slug);
    await prisma.service.update({ where: { id: svcId }, data: { isActive: false } });
    await prisma.category.update({ where: { id: catId }, data: { isActive: false } });
  });

  it("two levels only", async () => {
    const sub = await prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } });
    expect(await catalog.saveCategory(adminId, catId, { nameEn: "x", nameSw: "x", icon: null, sortOrder: 0, isActive: false, parentId: sub.id })).toEqual({ ok: false, error: "parentInvalid" });
  });

  it("areas sit under a district and must be inside Dar es Salaam", async () => {
    const district = await prisma.location.findFirstOrThrow({ where: { type: "DISTRICT" } });
    const ward = await prisma.location.findFirstOrThrow({ where: { type: "NEIGHBOURHOOD" } });
    const base = { name: `Mtaa ${run}`, latitude: null, longitude: null, isActive: false };
    expect(await catalog.saveLocation(adminId, null, { ...base, parentId: ward.id })).toEqual({ ok: false, error: "parentInvalid" });
    expect(await catalog.saveLocation(adminId, null, { ...base, parentId: district.id, latitude: -3.37, longitude: 36.68 })).toEqual({ ok: false, error: "pinOutsideArea" });
    const r = await catalog.saveLocation(adminId, null, { ...base, parentId: district.id, latitude: -6.8, longitude: 39.25 });
    expect(r.ok).toBe(true);
    if (r.ok) await prisma.location.delete({ where: { id: r.id } });
  });
});

describe("reports", () => {
  it("users can only report what they can see", async () => {
    expect(await oversight.fileReport(customer(customer2Id), { targetType: "CONVERSATION", targetId: matchId, reason: "OFFENSIVE", note: null })).toEqual({ ok: false, error: "notFound" });
    expect(await oversight.fileReport({ id: ownerId, role: "PROVIDER", status: "ACTIVE" }, { targetType: "PROVIDER", targetId: providerId, reason: "FAKE", note: null })).toEqual({ ok: false, error: "notAllowed" });
    expect(await oversight.fileReport({ id: otherOwnerId, role: "PROVIDER", status: "ACTIVE" }, { targetType: "REQUEST", targetId: requestId, reason: "SPAM", note: null })).toEqual({ ok: false, error: "notFound" });
    expect(await oversight.fileReport({ id: adminId, role: "ADMIN", status: "ACTIVE" }, { targetType: "PROVIDER", targetId: providerId, reason: "FAKE", note: null })).toEqual({ ok: false, error: "notAllowed" });
  });

  it("a party can report the conversation once; a customer can report a provider", async () => {
    expect(await oversight.fileReport(customer(customerId), { targetType: "CONVERSATION", targetId: matchId, reason: "OFFENSIVE", note: "Rude" })).toEqual({ ok: true });
    expect(await oversight.fileReport(customer(customerId), { targetType: "CONVERSATION", targetId: matchId, reason: "SPAM", note: null })).toEqual({ ok: false, error: "alreadyReported" });
    expect(await oversight.fileReport({ id: ownerId, role: "PROVIDER", status: "ACTIVE" }, { targetType: "REQUEST", targetId: requestId, reason: "FAKE", note: null })).toEqual({ ok: true });
    expect(await oversight.fileReport(customer(customer2Id), { targetType: "PROVIDER", targetId: providerId, reason: "FRAUD", note: "Asked for payment upfront" })).toEqual({ ok: true });
  });

  it("an admin sees the conversation only through the report, and that view is logged", async () => {
    const report = await prisma.report.findFirstOrThrow({ where: { targetType: "CONVERSATION", targetId: matchId } });
    const d = await oversight.reportDetail(adminId, report.id);
    expect(d?.conversation?.messages.map((m) => m.body)).toEqual(["Unaweza kuja leo?"]);
    expect(await prisma.auditLog.count({ where: { action: "report.viewed_conversation", entityId: report.id, actorId: adminId } })).toBe(1);
  });

  it("reports are resolved once, with a written outcome", async () => {
    const report = await prisma.report.findFirstOrThrow({ where: { targetType: "PROVIDER", targetId: providerId } });
    expect(await oversight.resolveReport(adminId, report.id, "DISMISSED", "Checked — legitimate")).toEqual({ ok: true });
    expect(await oversight.resolveReport(adminId, report.id, "RESOLVED", "again")).toEqual({ ok: false, error: "notFound" });
    expect((await oversight.listReports("DISMISSED")).some((r) => r.id === report.id)).toBe(true);
  });
});

describe("requests oversight", () => {
  it("an admin can close a request; the customer and providers are told", async () => {
    expect(await oversight.adminCancelRequest(adminId, requestId, "duplicate spam")).toEqual({ ok: true });
    expect((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("CANCELLED");
    expect(await prisma.notification.count({ where: { userId: customerId, type: "REQUEST_CANCELLED_BY_ADMIN" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ownerId, type: "REQUEST_CANCELLED" } })).toBe(1);
    expect(await oversight.adminCancelRequest(adminId, requestId, "again")).toEqual({ ok: false, error: "requestClosed" });
  });
});

describe("announcements", () => {
  it("reach active customers/providers of the audience, never admins or suspended accounts", async () => {
    await people.setUserStatus(actor(superId, "SUPER_ADMIN"), customer2Id, "SUSPENDED", "test");
    const r = await oversight.sendAnnouncement(superId, { titleEn: `Hello ${run}`, titleSw: `Habari ${run}`, bodyEn: "Maintenance tonight.", bodySw: "Matengenezo usiku huu.", audience: "CUSTOMERS" });
    expect(r.ok).toBe(true);
    const a = await prisma.announcement.findFirstOrThrow({ where: { titleEn: `Hello ${run}` } });
    const got = async (userId: string) => prisma.notification.count({ where: { userId, type: "ANNOUNCEMENT", data: { path: ["announcementId"], equals: a.id } } });
    expect(await got(customerId)).toBe(1);
    expect(await got(customer2Id)).toBe(0); // suspended
    expect(await got(ownerId)).toBe(0); // not in audience
    expect(await got(adminId)).toBe(0);
    await people.setUserStatus(actor(superId, "SUPER_ADMIN"), customer2Id, "ACTIVE", "test done");
  });
});

// Platform settings are written only by requests.test.ts (the one suite that depends on them),
// so parallel test files never race on the shared settings row.
describe("analytics and audit", () => {
  it("analytics and the audit log answer", async () => {
    const a = await platformAnalytics(7);
    expect(a.series).toHaveLength(7);
    expect(a.users.customers).toBeGreaterThan(0);
    const log = await auditLog({ action: "user.", entityType: null, actorId: adminId, page: 1 });
    expect(log.rows.length).toBeGreaterThan(0);
    expect(log.rows.every((r) => r.action.startsWith("user.") && r.actorId === adminId)).toBe(true);
    expect(log.rows[0]?.actor?.name).toBe("Admin One");
  });
});
