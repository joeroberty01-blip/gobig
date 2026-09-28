import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as bookings from "@/lib/services/bookings";
import { completeRequest } from "@/lib/services/requests";
import { RULES } from "@/lib/automation/rules";

// Automation Engine, Phase D: bookings, away mode and booking reminders on the test branch.
const run = `b${Date.now().toString(36)}`;
const domain = ".bookings.test.gobig.local";
let customerId: string;
let otherCustomerId: string;
let ownerId: string;
let providerId: string;
let requestId: string;

const asCustomer = (id = customerId): bookings.BookingActor => ({ side: "CUSTOMER", customerId: id });
const asProvider = (): bookings.BookingActor => ({ side: "PROVIDER", providerId });

/** "YYYY-MM-DDTHH:MM" in Dar es Salaam, `days` from now at `hour`:00. */
function darLocal(days: number, hour: number): string {
  const d = new Date(Date.now() + 3 * 3_600_000 + days * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}
/** The next given weekday (1 = Monday … 7 = Sunday), at least 2 days away. */
function nextWeekday(day: number): number {
  for (let i = 2; i < 10; i++) {
    const js = new Date(Date.now() + 3 * 3_600_000 + i * 86_400_000).getUTCDay();
    if ((js === 0 ? 7 : js) === day) return i;
  }
  return 2;
}

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER") {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, passwordHash: "x", role } })).id;
}
const types = async (userId: string) => (await prisma.notification.findMany({ where: { userId }, select: { type: true } })).map((n) => n.type);

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
  await prisma.automationRun.deleteMany({ where: { ruleId: "booking.reminder", subjectKey: { contains: run } } });
}

beforeAll(async () => {
  await cleanup();
  customerId = await makeUser("Booking Customer", "CUSTOMER");
  otherCustomerId = await makeUser("Other Customer", "CUSTOMER");
  ownerId = await makeUser("Booking Owner", "PROVIDER");
  providerId = (
    await prisma.provider.create({
      data: { slug: `booking-biz-${run}`, status: "ACTIVE", members: { create: { userId: ownerId, role: "OWNER" } }, profile: { create: { displayName: `Booking Biz ${run}`, openingHoursMode: "SCHEDULE" } } },
    })
  ).id;
  // Open Monday–Friday 08:00–17:00 (Dar time).
  await prisma.providerOpeningHours.createMany({ data: [1, 2, 3, 4, 5].map((d) => ({ providerId, dayOfWeek: d, opensAt: 480, closesAt: 1020 })) });
  const location = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  requestId = (
    await prisma.serviceRequest.create({
      data: { customerId, categoryId: category.id, description: `Booking test ${run}`, locationId: location.id, expiresAt: new Date(Date.now() + 30 * 86_400_000), status: "ACCEPTED", acceptedProviderId: providerId, acceptedAt: new Date() },
    })
  ).id;
}, 60_000);

afterAll(cleanup);

describe("proposing and confirming", () => {
  it("checks the time", async () => {
    expect(bookings.parseDarLocal("2026-10-01T14:30")?.toISOString()).toBe("2026-10-01T11:30:00.000Z");
    expect(bookings.parseDarLocal("tomorrow")).toBeNull();
    expect(await bookings.proposeTime(asCustomer(), requestId, "nonsense")).toEqual({ ok: false, error: "invalidTime" });
    expect(await bookings.proposeTime(asCustomer(), requestId, darLocal(0, 0))).toMatchObject({ ok: false }); // past/too soon
    expect(await bookings.proposeTime(asCustomer(), requestId, darLocal(120, 10))).toEqual({ ok: false, error: "tooFar" });
  });

  it("a customer books inside opening hours; the business may choose any time", async () => {
    const sunday = darLocal(nextWeekday(7), 10);
    expect(await bookings.proposeTime(asCustomer(), requestId, sunday)).toEqual({ ok: false, error: "outsideHours" });
    const eveningMonday = darLocal(nextWeekday(1), 19);
    expect(await bookings.proposeTime(asCustomer(), requestId, eveningMonday)).toEqual({ ok: false, error: "outsideHours" });
    expect(await bookings.proposeTime(asProvider(), requestId, sunday)).toEqual({ ok: true });
    await bookings.cancelBooking(asProvider(), requestId);
  });

  it("only the two sides can act; the proposer can't confirm their own time", async () => {
    const tuesday = darLocal(nextWeekday(2), 10);
    expect(await bookings.proposeTime(asCustomer(otherCustomerId), requestId, tuesday)).toEqual({ ok: false, error: "notFound" });
    expect(await bookings.proposeTime(asCustomer(), requestId, tuesday, "Geti la kijani")).toEqual({ ok: true });
    expect(await types(ownerId)).toContain("BOOKING_PROPOSED");
    expect(await bookings.confirmBooking(asCustomer(), requestId)).toEqual({ ok: false, error: "nothingToConfirm" });
    expect(await bookings.confirmBooking(asProvider(), requestId)).toEqual({ ok: true });
    expect(await types(customerId)).toContain("BOOKING_CONFIRMED");
    expect(await bookings.bookingFor(requestId)).toMatchObject({ status: "CONFIRMED", proposedBy: "CUSTOMER", note: "Geti la kijani" });
    expect(await prisma.event.count({ where: { subjectId: requestId, type: { in: ["booking.proposed", "booking.confirmed"] } } })).toBeGreaterThanOrEqual(2);
  });

  it("rescheduling needs confirming again", async () => {
    expect(await bookings.proposeTime(asProvider(), requestId, darLocal(nextWeekday(3), 11))).toEqual({ ok: true });
    expect(await bookings.bookingFor(requestId)).toMatchObject({ status: "PENDING", proposedBy: "PROVIDER" });
    expect(await bookings.confirmBooking(asProvider(), requestId)).toEqual({ ok: false, error: "nothingToConfirm" });
    expect(await bookings.confirmBooking(asCustomer(), requestId)).toEqual({ ok: true });
  });
});

describe("reminders and away mode", () => {
  it("reminds both sides once before a confirmed booking", async () => {
    // Move the confirmed booking to 30 minutes from now (inside both reminder windows).
    await prisma.booking.update({ where: { requestId }, data: { scheduledAt: new Date(Date.now() + 30 * 60_000) } });
    const rule = RULES.find((r) => r.id === "booking.reminder")!;
    const first = await rule.run({ params: rule.defaults, now: new Date() });
    expect(Number(first.soon) + Number(first.dayBefore)).toBeGreaterThanOrEqual(1);
    const again = await rule.run({ params: rule.defaults, now: new Date() });
    expect(again).toEqual({ soon: 0, dayBefore: 0 });
    expect((await types(customerId)).filter((t) => t === "BOOKING_REMINDER").length).toBeGreaterThanOrEqual(1);
    expect(await types(ownerId)).toContain("BOOKING_REMINDER");
  });

  it("going away warns customers with bookings in that time and blocks new times", async () => {
    await prisma.booking.update({ where: { requestId }, data: { scheduledAt: new Date(Date.now() + 2 * 86_400_000) } });
    expect(await bookings.setAway(providerId, darLocal(120, 9))).toEqual({ ok: false, error: "tooFar" });
    const r = await bookings.setAway(providerId, darLocal(5, 9), "Likizo");
    expect(r).toEqual({ ok: true, affected: 1 });
    expect(await types(customerId)).toContain("BOOKING_AT_RISK");
    expect(await bookings.proposeTime(asProvider(), requestId, darLocal(3, 10))).toEqual({ ok: false, error: "providerAway" });
    expect(await bookings.setAway(providerId, null)).toEqual({ ok: true, affected: 0 });
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).awayUntil).toBeNull();
  });

  it("the booking completes with its request", async () => {
    expect(await completeRequest(customerId, requestId)).toEqual({ ok: true });
    expect((await bookings.bookingFor(requestId))?.status).toBe("COMPLETED");
    expect(await bookings.cancelBooking(asCustomer(), requestId)).toEqual({ ok: false, error: "notAllowed" });
  });
});
