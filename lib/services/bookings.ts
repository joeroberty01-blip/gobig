import { prisma } from "@/lib/db";
import type { BookingParty, Prisma } from "@/generated/prisma/client";
import { notify, providerUserIds, type NotificationType } from "@/lib/services/notifications";
import { emitEvent } from "@/lib/automation/engine";
import { darClock } from "@/lib/provider/availability";

// Automation Engine, Phase D: bookings. After a customer chooses a business (request ACCEPTED),
// either side proposes a time; the other confirms. Either side can propose a new time (which needs
// confirming again) or cancel. The booking completes or cancels with its request. Every change
// notifies the other side and records an event, in one transaction.

export const MIN_LEAD_MIN = 30;
export const MAX_AHEAD_DAYS = 90;
export const MAX_AWAY_DAYS = 60;

export type BookingError = "notFound" | "notAllowed" | "invalidTime" | "tooSoon" | "tooFar" | "outsideHours" | "providerAway" | "nothingToConfirm";
export type BResult = { ok: true } | { ok: false; error: BookingError };
const fail = (error: BookingError): BResult => ({ ok: false, error });

/** Who is acting: the customer (their user id) or the business (its provider id). */
export type BookingActor = { side: "CUSTOMER"; customerId: string } | { side: "PROVIDER"; providerId: string };

/** "2026-10-01T14:30" typed in Dar es Salaam → an instant. Anything else is refused. */
export function parseDarLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function context(actor: BookingActor, requestId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const r = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, customerId: true, acceptedProviderId: true, booking: true },
  });
  if (!r || !r.acceptedProviderId) return null;
  const mine = actor.side === "CUSTOMER" ? r.customerId === actor.customerId : r.acceptedProviderId === actor.providerId;
  return mine ? r : null;
}

async function notifyOther(tx: Prisma.TransactionClient, actorSide: BookingParty, r: { id: string; customerId: string; acceptedProviderId: string | null }, type: NotificationType) {
  const users = actorSide === "CUSTOMER" ? await providerUserIds(tx, r.acceptedProviderId!) : [r.customerId];
  await notify(tx, users, type, { requestId: r.id });
}

/** Is `at` inside the business's opening hours (Dar time)? Always-open / by-appointment / no hours: yes. */
export async function withinOpeningHours(providerId: string, at: Date): Promise<boolean> {
  const p = await prisma.providerProfile.findUnique({ where: { providerId }, select: { openingHoursMode: true } });
  if (!p || p.openingHoursMode !== "SCHEDULE") return true;
  const hours = await prisma.providerOpeningHours.findMany({ where: { providerId } });
  if (!hours.length) return true;
  const { day, minute } = darClock(at);
  return hours.some((h) => h.dayOfWeek === day && h.opensAt <= minute && minute < h.closesAt);
}

export async function proposeTime(actor: BookingActor, requestId: string, whenLocal: string, note = "", now = new Date()): Promise<BResult> {
  const at = parseDarLocal(whenLocal);
  if (!at) return fail("invalidTime");
  if (at.getTime() < now.getTime() + MIN_LEAD_MIN * 60_000) return fail("tooSoon");
  if (at.getTime() > now.getTime() + MAX_AHEAD_DAYS * 86_400_000) return fail("tooFar");
  const r = await context(actor, requestId);
  if (!r) return fail("notFound");
  if (r.status !== "ACCEPTED") return fail("notAllowed");
  const providerId = r.acceptedProviderId!;
  const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { awayUntil: true } });
  if (provider?.awayUntil && provider.awayUntil > now && at < provider.awayUntil) return fail("providerAway");
  // A customer books inside the business's hours; the business itself may choose any time.
  if (actor.side === "CUSTOMER" && !(await withinOpeningHours(providerId, at))) return fail("outsideHours");

  const text = String(note ?? "").trim().slice(0, 300) || null;
  await prisma.$transaction(async (tx) => {
    await tx.booking.upsert({
      where: { requestId },
      create: { requestId, customerId: r.customerId, providerId, scheduledAt: at, proposedBy: actor.side, note: text },
      update: { scheduledAt: at, proposedBy: actor.side, note: text, status: "PENDING", confirmedAt: null, cancelledAt: null, cancelledBy: null },
    });
    await notifyOther(tx, actor.side, r, "BOOKING_PROPOSED");
    await emitEvent(tx, { type: "booking.proposed", subjectType: "ServiceRequest", subjectId: requestId, payload: { by: actor.side, reschedule: !!r.booking } });
  });
  return { ok: true };
}

/** The other side accepts the proposed time. The proposer can't confirm their own proposal. */
export async function confirmBooking(actor: BookingActor, requestId: string, now = new Date()): Promise<BResult> {
  const r = await context(actor, requestId);
  if (!r) return fail("notFound");
  if (r.status !== "ACCEPTED" || !r.booking || r.booking.status !== "PENDING" || r.booking.proposedBy === actor.side) return fail("nothingToConfirm");
  if (r.booking.scheduledAt <= now) return fail("tooSoon");
  const ok = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({ where: { requestId, status: "PENDING", proposedBy: r.booking!.proposedBy, scheduledAt: r.booking!.scheduledAt }, data: { status: "CONFIRMED", confirmedAt: now } });
    if (!count) return false;
    await notifyOther(tx, actor.side, r, "BOOKING_CONFIRMED");
    await emitEvent(tx, { type: "booking.confirmed", subjectType: "ServiceRequest", subjectId: requestId, payload: { by: actor.side } });
    return true;
  });
  return ok ? { ok: true } : fail("nothingToConfirm");
}

export async function cancelBooking(actor: BookingActor, requestId: string, now = new Date()): Promise<BResult> {
  const r = await context(actor, requestId);
  if (!r?.booking) return fail("notFound");
  const ok = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({ where: { requestId, status: { in: ["PENDING", "CONFIRMED"] } }, data: { status: "CANCELLED", cancelledAt: now, cancelledBy: actor.side } });
    if (!count) return false;
    await notifyOther(tx, actor.side, r, "BOOKING_CANCELLED");
    await emitEvent(tx, { type: "booking.cancelled", subjectType: "ServiceRequest", subjectId: requestId, payload: { by: actor.side } });
    return true;
  });
  return ok ? { ok: true } : fail("notAllowed");
}

/** Called inside the request's own transaction when it completes or is cancelled. */
export async function closeBookingWithRequest(tx: Prisma.TransactionClient, requestId: string, outcome: "COMPLETED" | "CANCELLED", now = new Date()) {
  await tx.booking.updateMany({
    where: { requestId, status: { in: ["PENDING", "CONFIRMED"] } },
    data: outcome === "COMPLETED" ? { status: "COMPLETED" } : { status: "CANCELLED", cancelledAt: now, cancelledBy: "CUSTOMER" },
  });
}

export async function bookingFor(requestId: string) {
  return prisma.booking.findUnique({ where: { requestId }, select: { status: true, scheduledAt: true, proposedBy: true, note: true, confirmedAt: true, cancelledBy: true } });
}

// ─── Away mode ──────────────────────────────────────────────────────────────────────────────

/**
 * The business sets or clears away mode. Customers with a booking inside the away period are told
 * (once per booking and away period), and the business stops getting new requests meanwhile.
 */
export async function setAway(providerId: string, untilLocal: string | null, note = "", now = new Date()): Promise<{ ok: true; affected: number } | { ok: false; error: "invalidTime" | "tooFar" }> {
  if (untilLocal === null) {
    await prisma.provider.update({ where: { id: providerId }, data: { awayUntil: null, awayNote: null } });
    return { ok: true, affected: 0 };
  }
  const until = parseDarLocal(untilLocal);
  if (!until || until <= now) return { ok: false, error: "invalidTime" };
  if (until.getTime() > now.getTime() + MAX_AWAY_DAYS * 86_400_000) return { ok: false, error: "tooFar" };
  const text = String(note ?? "").trim().slice(0, 160) || null;
  const affected = await prisma.$transaction(async (tx) => {
    await tx.provider.update({ where: { id: providerId }, data: { awayUntil: until, awayNote: text } });
    const bookings = await tx.booking.findMany({ where: { providerId, status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gt: now, lt: until } }, select: { requestId: true, customerId: true } });
    for (const b of bookings) await notify(tx, [b.customerId], "BOOKING_AT_RISK", { requestId: b.requestId });
    await emitEvent(tx, { type: "provider.away_set", subjectType: "Provider", subjectId: providerId, payload: { affectedBookings: bookings.length } });
    return bookings.length;
  });
  return { ok: true, affected };
}

export const isAway = (p: { awayUntil: Date | null }, now = new Date()) => !!p.awayUntil && p.awayUntil > now;
