import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createReplyToken } from "@/lib/requests/replyLink";
import { replyDeclineAction, replyInterestedAction, replyMessageAction, replyQuoteAction } from "@/lib/actions/replyLink";
import { notify } from "@/lib/services/notifications";
import { deliverNotification, DELIVER_JOB } from "@/lib/notifications/delivery";
import { renderNotification } from "@/lib/notifications/render";

// Product plan stage A on the test branch: SMS delivery rules and one-tap reply links.
const run = `s${Date.now().toString(36)}`;
const domain = ".sms.test.gobig.local";
let customerId: string;
let ownerId: string;
let outsiderId: string;
let providerId: string;
let requestId: string;
let matchId: string;

async function cleanup() {
  const ids = (await prisma.notification.findMany({ where: { user: { email: { endsWith: domain } } }, select: { id: true } })).map((n) => n.id);
  if (ids.length) await prisma.job.deleteMany({ where: { type: DELIVER_JOB, OR: ids.map((id) => ({ payload: { path: ["notificationId"], equals: id } })) } });
  await prisma.serviceRequest.deleteMany({ where: { description: { contains: run } } });
  await prisma.provider.deleteMany({ where: { slug: { startsWith: `sms-biz-${run}` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  process.env.AUTH_SECRET ||= "test-secret-for-reply-links-0123456789";
  await cleanup();
  const mk = async (name: string, role: "CUSTOMER" | "PROVIDER", phone: string | null) =>
    (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, phone, passwordHash: "x", role } })).id;
  customerId = await mk("Sms Customer", "CUSTOMER", `2557${Date.now().toString().slice(-8)}`);
  ownerId = await mk("Sms Owner", "PROVIDER", null);
  outsiderId = await mk("Sms Outsider", "PROVIDER", null);
  providerId = (await prisma.provider.create({ data: { slug: `sms-biz-${run}`, status: "ACTIVE", members: { create: { userId: ownerId, role: "OWNER" } } } })).id;
  const location = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  requestId = (
    await prisma.serviceRequest.create({
      data: { customerId, categoryId: category.id, description: `Bomba linavuja ${run}`, locationId: location.id, expiresAt: new Date(Date.now() + 86_400_000) },
    })
  ).id;
  matchId = (await prisma.requestMatch.create({ data: { requestId, providerId } })).id;
});
afterAll(cleanup);

describe("SMS channel", () => {
  it("records SMS as skipped without a gateway, and without a phone number", async () => {
    delete process.env.SMS_GATEWAY_USER;
    delete process.env.SMS_GATEWAY_PASS;
    await notify(prisma, [customerId, ownerId], "QUOTE_NEW", { requestId, matchId });
    const notes = await prisma.notification.findMany({ where: { userId: { in: [customerId, ownerId] }, type: "QUOTE_NEW" } });
    for (const n of notes) await deliverNotification(n.id, new Date("2026-10-10T09:00:00Z"));
    const sms = await prisma.notificationDelivery.findMany({ where: { notificationId: { in: notes.map((n) => n.id) }, channel: "SMS" } });
    const byUser = Object.fromEntries(sms.map((d) => [d.userId, d.reason]));
    expect(byUser[customerId]).toBe("smsNotConfigured");
    expect(byUser[ownerId]).toBe("noPhone");
  });

  it("a new request's SMS carries a one-tap reply link for that member", async () => {
    const r = await renderNotification({ type: "REQUEST_NEW", data: { requestId } }, { id: ownerId, role: "PROVIDER", locale: "sw" });
    expect(r?.smsUrl).toMatch(/\/r\/[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+\.[A-Za-z0-9_-]+$/);
    expect(r?.url).toBe(`/provider/requests/${requestId}`);
  });
});

describe("one-tap reply links", () => {
  it("a member of the business can reply through its link", async () => {
    const token = createReplyToken(matchId, ownerId);
    expect(await replyInterestedAction(token)).toEqual({ ok: true });
    expect(await replyMessageAction(token, "Naweza kuja leo.")).toEqual({ ok: true });
    expect(await replyQuoteAction(token, { amount: "35000", note: "Pamoja na vifaa" })).toEqual({ ok: true });
    const m = await prisma.requestMatch.findUniqueOrThrow({ where: { id: matchId } });
    expect(m.status).toBe("QUOTED");
    expect(m.firstResponseAt).not.toBeNull();
    expect(await prisma.quote.count({ where: { requestId, providerId, amount: 35000 } })).toBe(1);
  });

  it("a link for someone outside the business, or a bad link, does nothing", async () => {
    expect(await replyInterestedAction(createReplyToken(matchId, outsiderId))).toEqual({ ok: false, error: "invalid" });
    expect(await replyDeclineAction("garbage")).toEqual({ ok: false, error: "invalid" });
    expect(await replyQuoteAction(createReplyToken(matchId, ownerId), { amount: "5" })).toEqual({ ok: false, error: "error" });
  });

  it("declining closes the conversation for that business", async () => {
    const token = createReplyToken(matchId, ownerId);
    expect(await replyDeclineAction(token)).toEqual({ ok: true });
    expect(await replyMessageAction(token, "Hello again")).toEqual({ ok: false, error: "closed" });
  });
});
