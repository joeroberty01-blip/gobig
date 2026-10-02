import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { newAccountReviews, raiseFlags, requestSpam, reviewBursts, severityFor, verificationAges } from "@/lib/trust/risk";
import { resolveRiskFlag, listRiskFlags } from "@/lib/services/admin/risk";
import { RULES } from "@/lib/automation/rules";

// Automation Engine, Phase F: trust rules raise flags only — on the test branch.
const run = `r${Date.now().toString(36)}`;
const domain = ".risk.test.gobig.local";
let providerId: string;
let ownerId: string;
const reviewers: string[] = [];

const makeUser = async (name: string, role: "CUSTOMER" | "PROVIDER" = "CUSTOMER") =>
  (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;

async function cleanup() {
  await prisma.riskFlag.deleteMany({ where: { dedupeKey: { contains: run } } });
  if (providerId) await prisma.riskFlag.deleteMany({ where: { subjectId: providerId } });
  await prisma.provider.deleteMany({ where: { slug: { startsWith: `risk-biz-${run}` } } });
  await prisma.automationRun.deleteMany({ where: { subjectKey: { contains: run } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = await makeUser("Risk Owner", "PROVIDER");
  providerId = (
    await prisma.provider.create({ data: { slug: `risk-biz-${run}`, status: "ACTIVE", members: { create: { userId: ownerId, role: "OWNER" } }, profile: { create: { displayName: `Risk Biz ${run}` } } } })
  ).id;
  for (let i = 0; i < 4; i++) reviewers.push(await makeUser(`Risk Reviewer ${i}`));
  await prisma.review.createMany({ data: reviewers.map((authorId) => ({ providerId, authorId, rating: 5, body: "Huduma nzuri sana kabisa." })) });
});
afterAll(cleanup);

describe("Phase F: detectors", () => {
  it("spots a burst of reviews and reviews from brand-new accounts", async () => {
    const now = new Date();
    expect((await reviewBursts(4, 24, now)).find((f) => f.subjectId === providerId)).toMatchObject({ kind: "REVIEW_BURST", count: 4 });
    expect((await reviewBursts(5, 24, now)).find((f) => f.subjectId === providerId)).toBeUndefined();
    expect((await newAccountReviews(3, 2, now)).find((f) => f.subjectId === providerId)).toMatchObject({ kind: "NEW_ACCOUNT_REVIEWS", count: 4 });
  });

  it("spots one account posting many requests", async () => {
    const location = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const spammer = reviewers[0]!;
    await prisma.serviceRequest.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({ customerId: spammer, categoryId: category.id, description: `Spam test ${run} ${i}`, locationId: location.id, expiresAt: new Date(Date.now() + 86_400_000) })),
    });
    expect((await requestSpam(3, new Date())).find((f) => f.subjectId === spammer)).toMatchObject({ kind: "REQUEST_SPAM", count: 3 });
    await prisma.serviceRequest.deleteMany({ where: { customerId: spammer } });
  });

  it("severity: at the threshold is MEDIUM, double is HIGH, expiry warnings are LOW", () => {
    expect(severityFor({ kind: "REVIEW_BURST", count: 5, threshold: 5 })).toBe("MEDIUM");
    expect(severityFor({ kind: "REVIEW_BURST", count: 10, threshold: 5 })).toBe("HIGH");
    expect(severityFor({ kind: "VERIFICATION_EXPIRING", count: 0, threshold: 0 })).toBe("LOW");
  });
});

describe("Phase F: flag only", () => {
  it("raises each flag once per window and changes nothing else", async () => {
    const findings = await reviewBursts(4, 24, new Date());
    const mine = findings.filter((f) => f.subjectId === providerId).map((f) => ({ ...f, window: `${f.window}-${run}` }));
    expect(await raiseFlags(mine)).toBe(1);
    expect(await raiseFlags(mine)).toBe(0);
    // Nothing was banned, hidden or unpublished.
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).status).toBe("ACTIVE");
    expect(await prisma.review.count({ where: { providerId, status: "PUBLISHED" } })).toBe(4);
  });

  it("an admin closes a flag with a note, once, and it's audited", async () => {
    const flag = await prisma.riskFlag.findFirstOrThrow({ where: { subjectId: providerId, status: "OPEN" } });
    expect((await listRiskFlags("OPEN")).find((f) => f.id === flag.id)?.subject?.name).toBe(`Risk Biz ${run}`);
    expect(await resolveRiskFlag(ownerId, flag.id, "DISMISSED", "Checked: a real promotion day")).toBe(true);
    expect(await resolveRiskFlag(ownerId, flag.id, "ACTIONED", "again")).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: flag.id, action: "risk.resolved" } })).toBe(1);
  });
});

describe("Phase F: verification renewal", () => {
  it("finds verifications about to end and already ended", async () => {
    const level = await prisma.verificationLevel.findFirstOrThrow();
    const thirteenMonths = new Date();
    thirteenMonths.setUTCMonth(thirteenMonths.getUTCMonth() - 13);
    await prisma.provider.update({ where: { id: providerId }, data: { verificationLevelId: level.id, verifiedAt: thirteenMonths } });
    let ages = await verificationAges(12, 30, new Date());
    expect(ages.expired.map((p) => p.id)).toContain(providerId);

    const elevenAndAHalf = new Date();
    elevenAndAHalf.setUTCMonth(elevenAndAHalf.getUTCMonth() - 12);
    elevenAndAHalf.setUTCDate(elevenAndAHalf.getUTCDate() + 10);
    await prisma.provider.update({ where: { id: providerId }, data: { verifiedAt: elevenAndAHalf } });
    ages = await verificationAges(12, 30, new Date());
    expect(ages.expiring.map((p) => p.id)).toContain(providerId);
    expect(ages.expired.map((p) => p.id)).not.toContain(providerId);
  });

  it("the rule reminds the business once and keeps the badge", async () => {
    const rule = RULES.find((r) => r.id === "trust.verification-expiry")!;
    const first = await rule.run({ params: rule.defaults, now: new Date() });
    await rule.run({ params: rule.defaults, now: new Date() });
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.count({ where: { userId: ownerId, type: "VERIFICATION_EXPIRING" } })).toBe(1);
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).verificationLevelId).not.toBeNull();
    // Delivery jobs created by notify(); remove them with the notification.
    const ids = (await prisma.notification.findMany({ where: { userId: ownerId }, select: { id: true } })).map((n) => n.id);
    await prisma.job.deleteMany({ where: { OR: ids.map((id) => ({ payload: { path: ["notificationId"], equals: id } })) } });
    await prisma.automationRun.deleteMany({ where: { ruleId: { startsWith: "trust.verification-expiry" }, subjectKey: { startsWith: providerId } } });
  });
});
