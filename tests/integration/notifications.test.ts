import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/services/notifications";
import { deliverNotification, DELIVER_JOB } from "@/lib/notifications/delivery";
import { savePreferences, defaultPreferences } from "@/lib/notifications/preferences";
import { saveSubscription, MAX_SUBSCRIPTIONS_PER_USER } from "@/lib/notifications/subscription";
import { requestsWithoutResponse, requestsToReview } from "@/lib/automation/rules";
import { claimOnce } from "@/lib/automation/once";

// Automation Engine, Phase C: notification delivery and customer follow-ups on the test branch.
const run = `n${Date.now().toString(36)}`;
const domain = ".notify.test.gobig.local";
let userId: string;
let requestId: string;

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER" = "CUSTOMER") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}

async function latestNotification(type: string) {
  return prisma.notification.findFirstOrThrow({ where: { userId, type }, orderBy: { createdAt: "desc" } });
}

const deliveries = (notificationId: string) => prisma.notificationDelivery.findMany({ where: { notificationId }, orderBy: { channel: "asc" } });

async function cleanup() {
  const ids = (await prisma.notification.findMany({ where: { user: { email: { endsWith: domain } } }, select: { id: true } })).map((n) => n.id);
  if (ids.length) await prisma.job.deleteMany({ where: { type: DELIVER_JOB, OR: ids.map((id) => ({ payload: { path: ["notificationId"], equals: id } })) } });
  await prisma.automationRun.deleteMany({ where: { subjectKey: { contains: run } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  userId = await makeUser("Notify Customer");
  const location = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  requestId = (
    await prisma.serviceRequest.create({
      data: { customerId: userId, categoryId: category.id, description: `Notify test ${run}`, locationId: location.id, expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(Date.now() - 30 * 3_600_000) },
    })
  ).id;
}, 60_000);

afterAll(cleanup);

describe("notify() queues delivery", () => {
  it("one delivery job per notification, committed with it (and none if it rolls back)", async () => {
    await notify(prisma, [userId], "QUOTE_NEW", { requestId });
    const n = await latestNotification("QUOTE_NEW");
    expect(await prisma.job.count({ where: { type: DELIVER_JOB, payload: { path: ["notificationId"], equals: n.id } } })).toBe(1);

    const before = await prisma.notification.count({ where: { userId } });
    await expect(
      prisma.$transaction(async (tx) => {
        await notify(tx, [userId], "QUOTE_NEW", { requestId });
        throw new Error("rolled back");
      }),
    ).rejects.toThrow();
    expect(await prisma.notification.count({ where: { userId } })).toBe(before);
  });
});

describe("delivery decisions", () => {
  it("records why nothing was sent, and never records twice", async () => {
    await savePreferences(userId, { ...defaultPreferences(), quietStart: null, quietEnd: null });
    await notify(prisma, [userId], "REQUEST_INTEREST", { requestId });
    const n = await latestNotification("REQUEST_INTEREST");
    await deliverNotification(n.id);
    await deliverNotification(n.id);
    const d = await deliveries(n.id);
    expect(d.map((x) => [x.channel, x.status, x.reason])).toEqual([
      ["PUSH", "SKIPPED", "noSubscription"],
      ["EMAIL", "SKIPPED", "preference"], // email is opt-in
      ["SMS", "SKIPPED", "noPhone"], // SMS is on for requests, but this account has no phone
    ]);
    expect(d.every((x) => x.attempts === 1)).toBe(true);
  });

  it("respects a switched-off category", async () => {
    const prefs = defaultPreferences();
    prefs.categories.REQUESTS.push = false;
    await savePreferences(userId, { ...prefs, quietStart: null, quietEnd: null });
    await notify(prisma, [userId], "QUOTE_NEW", { requestId });
    const n = await latestNotification("QUOTE_NEW");
    await deliverNotification(n.id);
    expect((await deliveries(n.id)).find((x) => x.channel === "PUSH")).toMatchObject({ status: "SKIPPED", reason: "preference" });
  });

  it("holds normal messages in quiet hours, but not live trip updates", async () => {
    await savePreferences(userId, { ...defaultPreferences(), quietStart: 0, quietEnd: 1439 }); // quiet almost all day
    await notify(prisma, [userId], "REQUEST_INTEREST", { requestId });
    const n = await latestNotification("REQUEST_INTEREST");
    await deliverNotification(n.id);
    expect((await deliveries(n.id)).find((x) => x.channel === "PUSH")).toMatchObject({ status: "QUEUED", reason: "quietHours" });
    expect(await prisma.job.count({ where: { dedupeKey: `deliver-later:${n.id}` } })).toBe(1);

    // A trip update is urgent: it goes straight to the device check (none here).
    const trip = await prisma.notification.create({ data: { userId, type: "TRIP_ARRIVED", data: { tripId: "no-such-trip" } } });
    await deliverNotification(trip.id);
    expect((await deliveries(trip.id)).find((x) => x.channel === "PUSH")?.reason).not.toBe("quietHours");
    await prisma.job.deleteMany({ where: { dedupeKey: `deliver-later:${n.id}` } });
  });

  it("stops at the daily cap", async () => {
    await savePreferences(userId, { ...defaultPreferences(), quietStart: null, quietEnd: null });
    const filler = await prisma.notification.createManyAndReturn({ data: Array.from({ length: 30 }, () => ({ userId, type: "QUOTE_NEW", data: { requestId } })), select: { id: true } });
    await prisma.notificationDelivery.createMany({ data: filler.map((f) => ({ notificationId: f.id, userId, channel: "PUSH" as const, status: "SENT" as const, sentAt: new Date() })) });
    await notify(prisma, [userId], "QUOTE_NEW", { requestId });
    const n = await latestNotification("QUOTE_NEW");
    await deliverNotification(n.id);
    expect((await deliveries(n.id)).find((x) => x.channel === "PUSH")).toMatchObject({ status: "SKIPPED", reason: "dailyCap" });
  });

  it("rejects half-set quiet hours", async () => {
    expect(await savePreferences(userId, { ...defaultPreferences(), quietStart: 60, quietEnd: null })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("push subscriptions", () => {
  const sub = (i: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${run}-${i}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });

  it("accepts real push services, refuses internal addresses, keeps the newest few", async () => {
    expect(await saveSubscription(userId, { ...sub(0), endpoint: "https://169.254.169.254/latest" })).toEqual({ ok: false, error: "invalid" });
    for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_USER + 3; i++) expect(await saveSubscription(userId, sub(i))).toEqual({ ok: true });
    expect(await prisma.pushSubscription.count({ where: { userId } })).toBe(MAX_SUBSCRIPTIONS_PER_USER);
    await prisma.pushSubscription.deleteMany({ where: { userId } }); // no fake devices left for delivery tests
  });
});

describe("customer follow-ups", () => {
  it("finds a request nobody answered and nudges only once", async () => {
    const due = await requestsWithoutResponse(24, new Date());
    expect(due.map((r) => r.id)).toContain(requestId);
    expect(await claimOnce("request.no-response", requestId)).toBe(true);
    expect(await claimOnce("request.no-response", requestId)).toBe(false);
    await prisma.automationRun.deleteMany({ where: { ruleId: "request.no-response", subjectKey: `item:${requestId}` } });
  });

  it("invites a review only when the customer hasn't reviewed that business", async () => {
    const ownerId = await makeUser("Notify Owner", "PROVIDER");
    const provider = await prisma.provider.create({ data: { slug: `notify-biz-${run}`, members: { create: { userId: ownerId, role: "OWNER" } } } });
    await prisma.serviceRequest.update({ where: { id: requestId }, data: { status: "COMPLETED", acceptedProviderId: provider.id, acceptedAt: new Date(Date.now() - 5 * 3_600_000), completedAt: new Date(Date.now() - 3 * 3_600_000) } });
    expect((await requestsToReview(2, new Date())).map((r) => r.id)).toContain(requestId);
    await prisma.review.create({ data: { providerId: provider.id, authorId: userId, rating: 5, body: "Kazi nzuri sana, asante." } });
    expect((await requestsToReview(2, new Date())).map((r) => r.id)).not.toContain(requestId);
    await prisma.provider.delete({ where: { id: provider.id } });
  });
});
