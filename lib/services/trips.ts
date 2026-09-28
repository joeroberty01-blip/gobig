import { randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma, type PaymentMethod, type TripKind, type VehicleType } from "@/generated/prisma/client";
import { distanceKm, inServiceRegion, publicPoint, round, type Point } from "@/lib/geo";
import { normalizePhone } from "@/lib/phone";
import { encryptionConfigured, open, openPoint, seal, sealPoint } from "@/lib/crypto/fieldCipher";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { notify, providerUserIds, type NotificationType } from "@/lib/services/notifications";
import { nearestAreaName } from "@/lib/services/discovery";
import { enqueue } from "@/lib/jobs/queue";
import { mediaUrl } from "@/lib/storage";
import { getPlatformSettings } from "@/lib/services/platformSettings";

// Phase 17: rides & deliveries (ADR-055). One engine for both kinds:
//   REQUESTED → (a nearby verified driver accepts) ACCEPTED → ARRIVED → IN_PROGRESS → COMPLETED
//   REQUESTED → EXPIRED (nobody accepted in time); CANCELLED by either side before completion.
// Exact customer points, notes and recipient details are encrypted and erased after
// TRIP_PURGE_DAYS; drivers see exact points only once they've accepted. Fares come from the
// driver's own rates; payment is settled off-app and only recorded.

// Defaults; the live values come from platform settings (admin → Settings), Phase 17.
export const REQUEST_TTL_MIN = 10;
export const OFFER_BATCH = 5;
export const DISPATCH_RADII_KM = [3, 6, 10] as const;
export const REDISPATCH_AFTER_SEC = 45;

/** A driver who hasn't sent a position for this long is treated as offline for dispatch. */
export const DRIVER_STALE_MIN = 2;
export const TRIP_PURGE_DAYS = 30;
export const MAX_ACTIVE_TRIPS = 2;
export const RATING_WINDOW_DAYS = 7;
const MIN_TRIP_KM = 0.2;
const ACTIVE = ["REQUESTED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"] as const;

// Purposes bind each encrypted value to its field (a sealed pickup can't be replayed as a phone).
const P = { pickup: "trip.pickup", dropoff: "trip.dropoff", note: "trip.note", rName: "trip.recipientName", rPhone: "trip.recipientPhone", code: "trip.code" };

export type TripError =
  | "unavailable"
  | "invalid"
  | "outsideArea"
  | "tooShort"
  | "tooLong"
  | "tooManyActive"
  | "rateLimited"
  | "notFound"
  | "notAllowed"
  | "taken"
  | "wrongCode"
  | "notVerified"
  | "noDriverProfile"
  | "busy"
  | "alreadyRated";
export type TResult<T = object> = ({ ok: true } & T) | { ok: false; error: TripError };

const fail = (error: TripError) => ({ ok: false as const, error });
const point = z.object({ lat: z.number().finite(), lng: z.number().finite() });

/** Estimated fare from a driver's own rates, rounded to 100 TZS. */
export function fareFor(base: number, perKm: number, km: number): number {
  return Math.round((base + perKm * km) / 100) * 100;
}

function newCode(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a.padEnd(8));
  const y = Buffer.from(b.padEnd(8));
  return x.length === y.length && timingSafeEqual(x, y);
}

const coarse = (p: Point) => round(p, 2);

// ─── Driver side ────────────────────────────────────────────────────────────────────────────

export const driverProfileSchema = z
  .object({
    offersRides: z.boolean(),
    offersDelivery: z.boolean(),
    vehicleType: z.enum(["BODA", "BAJAJI", "CAR", "VAN"]),
    vehicleModel: z.string().trim().min(2).max(40),
    vehicleColor: z.string().trim().min(2).max(20),
    plateNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9 -]{4,12}$/),
    baseFare: z.number().int().min(0).max(1_000_000),
    perKmFare: z.number().int().min(0).max(100_000),
  })
  .refine((v) => v.offersRides || v.offersDelivery, { path: ["offersRides"] });
export type DriverProfileInput = z.infer<typeof driverProfileSchema>;

export async function getDriverProfile(providerId: string) {
  return prisma.driverProfile.findUnique({ where: { providerId } });
}

export async function saveDriverProfile(providerId: string, raw: unknown): Promise<TResult> {
  const parsed = driverProfileSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  await prisma.driverProfile.upsert({ where: { providerId }, create: { providerId, ...parsed.data }, update: parsed.data });
  return { ok: true };
}

/** Only published, verified, real (not sample) businesses with a driver profile can go online. */
async function driverEligible(providerId: string): Promise<TripError | null> {
  const p = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { status: true, deletedAt: true, isDemo: true, verificationLevelId: true, driver: { select: { id: true } } },
  });
  if (!p || p.deletedAt || p.status !== "ACTIVE" || p.isDemo) return "notAllowed";
  if (!p.verificationLevelId) return "notVerified";
  if (!p.driver) return "noDriverProfile";
  return null;
}

export async function setOnline(providerId: string, online: boolean, at?: Point): Promise<TResult> {
  if (!online) {
    await prisma.driverProfile.updateMany({ where: { providerId }, data: { online: false, lastLat: null, lastLng: null, lastSeenAt: null } });
    return { ok: true };
  }
  const blocked = await driverEligible(providerId);
  if (blocked) return fail(blocked);
  if (!at || !point.safeParse(at).success || !inServiceRegion(at)) return fail("outsideArea");
  await prisma.driverProfile.update({ where: { providerId }, data: { online: true, lastLat: at.lat, lastLng: at.lng, lastSeenAt: new Date() } });
  return { ok: true };
}

/** Position ping from an online driver's open app. */
export async function updateDriverLocation(providerId: string, at: Point): Promise<TResult> {
  if (!point.safeParse(at).success || !inServiceRegion(at)) return fail("outsideArea");
  if (!(await hit(LIMITS.driverLocationPerProvider, providerId)).ok) return fail("rateLimited");
  const { count } = await prisma.driverProfile.updateMany({ where: { providerId, online: true }, data: { lastLat: at.lat, lastLng: at.lng, lastSeenAt: new Date() } });
  return count ? { ok: true } : fail("notAllowed");
}

// ─── Customer side: requesting ──────────────────────────────────────────────────────────────

const baseRequest = z.object({
  pickup: point,
  dropoff: point,
  vehicleType: z.enum(["BODA", "BAJAJI", "CAR", "VAN"]),
  note: z.string().trim().max(200).optional().default(""),
  destinationSlug: z.string().trim().max(80).optional(),
  /** Delivery from a business: the pickup is labelled with its name if the pin is near it. */
  originSlug: z.string().trim().max(80).optional(),
});
export const rideRequestSchema = baseRequest.extend({ kind: z.literal("RIDE") });
export const deliveryRequestSchema = baseRequest.extend({
  kind: z.literal("DELIVERY"),
  packageSize: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  packageDescription: z.string().trim().min(2).max(200),
  fragile: z.boolean().default(false),
  recipientName: z.string().trim().min(2).max(60),
  recipientPhone: z.string().trim().min(6).max(20),
});
export const tripRequestSchema = z.discriminatedUnion("kind", [rideRequestSchema, deliveryRequestSchema]);

export async function requestTrip(customer: { id: string; role: string; status: string }, raw: unknown, now = new Date()): Promise<TResult<{ tripId: string }>> {
  if (customer.role !== "CUSTOMER" || customer.status !== "ACTIVE") return fail("notAllowed");
  if (!encryptionConfigured()) return fail("unavailable");
  const parsed = tripRequestSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  const settings = await getPlatformSettings();
  if ((input.kind === "RIDE" && !settings.ridesEnabled) || (input.kind === "DELIVERY" && !settings.deliveriesEnabled)) return fail("unavailable");
  if (!inServiceRegion(input.pickup) || !inServiceRegion(input.dropoff)) return fail("outsideArea");
  const km = distanceKm(input.pickup, input.dropoff);
  if (km < MIN_TRIP_KM) return fail("tooShort");
  if (km > settings.tripMaxKm) return fail("tooLong");

  let recipientPhone: string | null = null;
  if (input.kind === "DELIVERY") {
    recipientPhone = normalizePhone(input.recipientPhone);
    if (!recipientPhone) return fail("invalid");
  }
  if (!(await hit(LIMITS.tripPerUser, customer.id)).ok) return fail("rateLimited");
  const active = await prisma.trip.count({ where: { customerId: customer.id, status: { in: [...ACTIVE] } } });
  if (active >= MAX_ACTIVE_TRIPS) return fail("tooManyActive");

  // A business as destination: labelled with its name only if the pin is near its public point.
  let destination: { id: string; name: string } | null = null;
  if (input.destinationSlug) {
    const d = await destinationFor(input.destinationSlug);
    if (d && distanceKm(d.point, input.dropoff) <= 1) destination = { id: d.id, name: d.name };
  }
  let origin: { name: string } | null = null;
  if (input.originSlug) {
    const o = await destinationFor(input.originSlug);
    if (o && distanceKm(o.point, input.pickup) <= 1) origin = { name: o.name };
  }
  const [pickupArea, dropoffArea] = await Promise.all([nearestAreaName(input.pickup), nearestAreaName(input.dropoff)]);
  const c = coarse(input.pickup);

  const trip = await prisma.trip.create({
    data: {
      kind: input.kind,
      customerId: customer.id,
      vehicleType: input.vehicleType,
      pickupSealed: sealPoint(input.pickup, P.pickup),
      dropoffSealed: sealPoint(input.dropoff, P.dropoff),
      pickupLatCoarse: c.lat,
      pickupLngCoarse: c.lng,
      pickupLabel: origin?.name ?? pickupArea ?? "Dar es Salaam",
      dropoffLabel: destination?.name ?? dropoffArea ?? "Dar es Salaam",
      destinationProviderId: destination?.id ?? null,
      noteSealed: input.note ? seal(input.note, P.note) : null,
      distanceKm: Math.round(km * 10) / 10,
      codeSealed: seal(newCode(), P.code),
      expiresAt: new Date(now.getTime() + settings.tripRequestTtlMin * 60_000),
      ...(input.kind === "DELIVERY"
        ? {
            packageSize: input.packageSize,
            packageDescription: input.packageDescription,
            fragile: input.fragile,
            recipientNameSealed: seal(input.recipientName, P.rName),
            recipientPhoneSealed: seal(recipientPhone!, P.rPhone),
          }
        : {}),
    },
    select: { id: true },
  });

  await dispatch(trip.id, 0);
  await enqueue("trip:redispatch", { tripId: trip.id, round: 1 }, { runAt: new Date(now.getTime() + REDISPATCH_AFTER_SEC * 1000), dedupeKey: `trip-redispatch:${trip.id}:1` });
  await enqueue("trip:expire", { tripId: trip.id }, { runAt: new Date(now.getTime() + settings.tripRequestTtlMin * 60_000 + 5_000), dedupeKey: `trip-expire:${trip.id}` });
  return { ok: true, tripId: trip.id };
}

/** A published business's public point (never more precise than its owner allows). */
export async function destinationFor(slug: string): Promise<{ id: string; name: string; point: Point } | null> {
  const p = await prisma.provider.findFirst({
    where: { slug, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      profile: { select: { displayName: true, latitude: true, longitude: true, locationVisibility: true, primaryLocation: { select: { latitude: true, longitude: true } } } },
    },
  });
  if (!p?.profile) return null;
  const pin = p.profile.latitude != null && p.profile.longitude != null ? { lat: Number(p.profile.latitude), lng: Number(p.profile.longitude) } : null;
  const area = p.profile.primaryLocation?.latitude != null ? { lat: Number(p.profile.primaryLocation.latitude), lng: Number(p.profile.primaryLocation.longitude) } : null;
  const pub = publicPoint(p.profile.locationVisibility, pin, area);
  return pub ? { id: p.id, name: p.profile.displayName, point: pub.point } : null;
}

/**
 * Offers a REQUESTED trip to the nearest eligible online drivers not yet asked, widening the
 * radius each round. Dispatch is a pluggable step: an external dispatcher (e.g. a Bolt
 * integration) would replace this function's body, not its callers.
 */
export async function dispatch(tripId: string, roundNo: number, now = new Date()): Promise<number> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { status: true, expiresAt: true, kind: true, vehicleType: true, pickupLatCoarse: true, pickupLngCoarse: true, offers: { select: { providerId: true } } },
  });
  if (!trip || trip.status !== "REQUESTED" || trip.expiresAt <= now) return 0;
  // Widen round by round up to the admin's maximum radius.
  const maxRadius = (await getPlatformSettings()).tripMaxRadiusKm;
  const radius = Math.min(roundNo < DISPATCH_RADII_KM.length - 1 ? DISPATCH_RADII_KM[roundNo]! : maxRadius, maxRadius);
  const from = { lat: trip.pickupLatCoarse, lng: trip.pickupLngCoarse };
  const dLat = radius / 111;
  const dLng = radius / (111 * Math.cos((from.lat * Math.PI) / 180));
  const asked = trip.offers.map((o) => o.providerId);

  const candidates = await prisma.driverProfile.findMany({
    where: {
      online: true,
      lastSeenAt: { gte: new Date(now.getTime() - DRIVER_STALE_MIN * 60_000) },
      lastLat: { gte: from.lat - dLat, lte: from.lat + dLat },
      lastLng: { gte: from.lng - dLng, lte: from.lng + dLng },
      vehicleType: trip.vehicleType,
      ...(trip.kind === "RIDE" ? { offersRides: true } : { offersDelivery: true }),
      providerId: { notIn: asked },
      provider: { status: "ACTIVE", deletedAt: null, isDemo: false, verificationLevelId: { not: null }, OR: [{ awayUntil: null }, { awayUntil: { lte: now } }] },
    },
    select: { providerId: true, lastLat: true, lastLng: true },
    take: 200,
  });
  // Drivers already on a trip aren't offered another.
  const busy = new Set(
    (await prisma.trip.findMany({ where: { driverProviderId: { in: candidates.map((c) => c.providerId) }, status: { in: ["ACCEPTED", "ARRIVED", "IN_PROGRESS"] } }, select: { driverProviderId: true } })).map(
      (t) => t.driverProviderId,
    ),
  );
  const chosen = candidates
    .filter((c) => !busy.has(c.providerId))
    .map((c) => ({ providerId: c.providerId, km: distanceKm(from, { lat: c.lastLat!, lng: c.lastLng! }) }))
    .filter((c) => c.km <= radius)
    .sort((a, b) => a.km - b.km)
    .slice(0, OFFER_BATCH);
  if (!chosen.length) return 0;

  await prisma.tripOffer.createMany({ data: chosen.map((c) => ({ tripId, providerId: c.providerId, distanceKm: Math.round(c.km * 10) / 10 })), skipDuplicates: true });
  // One query for every chosen driver's accounts (Phase 19: was one query per driver).
  const userIds = (await prisma.providerMember.findMany({ where: { providerId: { in: chosen.map((c) => c.providerId) } }, select: { userId: true } })).map((m) => m.userId);
  await notify(prisma, userIds, "TRIP_OFFER", { tripId });
  return chosen.length;
}

// ─── Driver side: offers and progress ───────────────────────────────────────────────────────

export async function acceptOffer(providerId: string, offerId: string, now = new Date()): Promise<TResult<{ tripId: string }>> {
  const offer = await prisma.tripOffer.findFirst({ where: { id: offerId, providerId }, select: { id: true, status: true, tripId: true } });
  if (!offer) return fail("notFound");
  if (offer.status !== "OFFERED") return fail("taken");
  const driver = await prisma.driverProfile.findUnique({ where: { providerId }, select: { online: true, baseFare: true, perKmFare: true } });
  if (!driver?.online) return fail("notAllowed");
  const blocked = await driverEligible(providerId);
  if (blocked) return fail(blocked);

  const trip = await prisma.trip.findUnique({ where: { id: offer.tripId }, select: { distanceKm: true } });
  if (!trip) return fail("notFound");
  // One atomic statement, no held transaction (Phase 19): the status guard makes acceptance
  // first-come, and the partial unique index "Trip_one_active_per_driver" rejects a second active
  // trip for the same driver even when two acceptances race.
  let count = 0;
  try {
    ({ count } = await prisma.trip.updateMany({
      where: { id: offer.tripId, status: "REQUESTED", expiresAt: { gt: now } },
      data: {
        status: "ACCEPTED",
        driverProviderId: providerId,
        acceptedAt: now,
        fareBase: driver.baseFare,
        farePerKm: driver.perKmFare,
        fareEstimate: fareFor(driver.baseFare, driver.perKmFare, trip.distanceKm),
      },
    }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("busy");
    throw err;
  }
  if (!count) {
    await prisma.tripOffer.updateMany({ where: { id: offer.id, status: "OFFERED" }, data: { status: "MISSED", respondedAt: now } });
    return fail("taken");
  }
  await prisma.tripOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", respondedAt: now } });
  await prisma.tripOffer.updateMany({ where: { tripId: offer.tripId, status: "OFFERED" }, data: { status: "MISSED", respondedAt: now } });
  await notifyCustomer(offer.tripId, "TRIP_ACCEPTED");
  return { ok: true, tripId: offer.tripId };
}

export async function declineOffer(providerId: string, offerId: string): Promise<TResult> {
  const { count } = await prisma.tripOffer.updateMany({ where: { id: offerId, providerId, status: "OFFERED" }, data: { status: "DECLINED", respondedAt: new Date() } });
  return count ? { ok: true } : fail("notFound");
}

async function notifyCustomer(tripId: string, type: NotificationType) {
  const t = await prisma.trip.findUnique({ where: { id: tripId }, select: { customerId: true } });
  if (t) await notify(prisma, [t.customerId], type, { tripId });
}

async function notifyDriver(tripId: string, type: NotificationType) {
  const t = await prisma.trip.findUnique({ where: { id: tripId }, select: { driverProviderId: true } });
  if (t?.driverProviderId) await notify(prisma, await providerUserIds(prisma, t.driverProviderId), type, { tripId });
}

/** Moves the driver's own trip one step, only from the expected state (no skipping, no replays). */
async function step(providerId: string, tripId: string, from: "ACCEPTED" | "ARRIVED" | "IN_PROGRESS", data: Prisma.TripUpdateManyMutationInput): Promise<boolean> {
  const { count } = await prisma.trip.updateMany({ where: { id: tripId, driverProviderId: providerId, status: from }, data });
  return count > 0;
}

export async function markArrived(providerId: string, tripId: string): Promise<TResult> {
  if (!(await step(providerId, tripId, "ACCEPTED", { status: "ARRIVED", arrivedAt: new Date() }))) return fail("notAllowed");
  await notifyCustomer(tripId, "TRIP_ARRIVED");
  return { ok: true };
}

async function codeMatches(tripId: string, providerId: string, code: string): Promise<TripError | null> {
  if (!(await hit(LIMITS.tripCodePerTrip, tripId)).ok) return "rateLimited";
  const t = await prisma.trip.findFirst({ where: { id: tripId, driverProviderId: providerId }, select: { codeSealed: true } });
  if (!t?.codeSealed) return "notFound";
  return sameCode(open(t.codeSealed, P.code), code.trim()) ? null : "wrongCode";
}

/** Ride: the rider's PIN starts it. Delivery: "picked up" (the code is for the handover). */
export async function startTrip(providerId: string, tripId: string, code?: string): Promise<TResult> {
  const t = await prisma.trip.findFirst({ where: { id: tripId, driverProviderId: providerId }, select: { kind: true } });
  if (!t) return fail("notFound");
  if (t.kind === "RIDE") {
    const err = await codeMatches(tripId, providerId, code ?? "");
    if (err) return fail(err);
  }
  if (!(await step(providerId, tripId, "ARRIVED", { status: "IN_PROGRESS", startedAt: new Date() }))) return fail("notAllowed");
  await notifyCustomer(tripId, "TRIP_STARTED");
  return { ok: true };
}

const completeSchema = z.object({
  fareFinal: z.number().int().min(0).max(10_000_000),
  paymentMethod: z.enum(["CASH", "MPESA", "TIGO_PESA", "AIRTEL_MONEY", "HALOPESA", "BANK_TRANSFER"]),
  code: z.string().trim().max(8).optional(),
});

/** Delivery needs the recipient's code. Fare and method are recorded; money moves off-app. */
export async function completeTrip(providerId: string, tripId: string, raw: unknown): Promise<TResult> {
  const parsed = completeSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const t = await prisma.trip.findFirst({ where: { id: tripId, driverProviderId: providerId }, select: { kind: true } });
  if (!t) return fail("notFound");
  if (t.kind === "DELIVERY") {
    const err = await codeMatches(tripId, providerId, parsed.data.code ?? "");
    if (err) return fail(err);
  }
  const ok = await step(providerId, tripId, "IN_PROGRESS", {
    status: "COMPLETED",
    completedAt: new Date(),
    fareFinal: parsed.data.fareFinal,
    paymentMethod: parsed.data.paymentMethod as PaymentMethod,
  });
  if (!ok) return fail("notAllowed");
  await notifyCustomer(tripId, "TRIP_COMPLETED");
  return { ok: true };
}

export async function cancelByDriver(providerId: string, tripId: string, reason: string): Promise<TResult> {
  const r = reason.trim().slice(0, 200);
  const { count } = await prisma.trip.updateMany({
    where: { id: tripId, driverProviderId: providerId, status: { in: ["ACCEPTED", "ARRIVED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "DRIVER", cancelReason: r || null },
  });
  if (!count) return fail("notAllowed");
  await notifyCustomer(tripId, "TRIP_CANCELLED");
  return { ok: true };
}

// ─── Customer side: cancel, rate ────────────────────────────────────────────────────────────

export async function cancelByCustomer(customerId: string, tripId: string): Promise<TResult> {
  const now = new Date();
  const t = await prisma.trip.findFirst({ where: { id: tripId, customerId }, select: { status: true, driverProviderId: true } });
  if (!t) return fail("notFound");
  const { count } = await prisma.trip.updateMany({
    where: { id: tripId, customerId, status: { in: ["REQUESTED", "ACCEPTED", "ARRIVED"] } },
    data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "CUSTOMER" },
  });
  if (!count) return fail("notAllowed");
  await prisma.tripOffer.updateMany({ where: { tripId, status: "OFFERED" }, data: { status: "EXPIRED", respondedAt: now } });
  if (t.driverProviderId) await notifyDriver(tripId, "TRIP_CANCELLED");
  return { ok: true };
}

const rateSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional().default("") });

export async function rateTrip(customerId: string, tripId: string, raw: unknown, now = new Date()): Promise<TResult> {
  const parsed = rateSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const t = await prisma.trip.findFirst({ where: { id: tripId, customerId }, select: { status: true, completedAt: true, ratedAt: true, driverProviderId: true } });
  if (!t) return fail("notFound");
  if (t.ratedAt) return fail("alreadyRated");
  if (t.status !== "COMPLETED" || !t.driverProviderId || !t.completedAt || now.getTime() - t.completedAt.getTime() > RATING_WINDOW_DAYS * 86_400_000) return fail("notAllowed");
  const driverId = t.driverProviderId;
  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.trip.updateMany({ where: { id: tripId, customerId, ratedAt: null }, data: { rating: parsed.data.rating, ratingComment: parsed.data.comment || null, ratedAt: now } });
    if (!count) return false;
    // Recomputed from the trips themselves, inside the same transaction, so it can't drift.
    const agg = await tx.trip.aggregate({ where: { driverProviderId: driverId, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } });
    await tx.driverProfile.updateMany({ where: { providerId: driverId }, data: { ratingAvg: agg._avg.rating, ratingCount: agg._count.rating } });
    return true;
  });
  return done ? { ok: true } : fail("alreadyRated");
}

// ─── Chat ───────────────────────────────────────────────────────────────────────────────────

/**
 * A message from the trip's customer or its driver, only while the trip is active. The caller's
 * side comes from who they are (session), never from the request.
 */
export async function sendTripMessage(
  who: { userId: string; customerId?: string; providerId?: string },
  tripId: string,
  text: string,
): Promise<TResult> {
  const body = String(text ?? "").trim().slice(0, 500);
  if (!body) return fail("invalid");
  const t = await prisma.trip.findUnique({ where: { id: tripId }, select: { customerId: true, driverProviderId: true, status: true } });
  if (!t) return fail("notFound");
  const sender = who.customerId && t.customerId === who.customerId ? "CUSTOMER" : who.providerId && t.driverProviderId === who.providerId ? "DRIVER" : null;
  if (!sender) return fail("notFound");
  if (!["ACCEPTED", "ARRIVED", "IN_PROGRESS"].includes(t.status)) return fail("notAllowed");
  if (!(await hit(LIMITS.messagePerUser, who.userId)).ok) return fail("rateLimited");
  await prisma.tripMessage.create({ data: { tripId, sender, body } });
  return { ok: true };
}

// ─── Reading ────────────────────────────────────────────────────────────────────────────────

const driverCard = {
  id: true,
  slug: true,
  verificationLevelId: true,
  profile: { select: { displayName: true, phone: true, whatsapp: true } },
  media: { where: { kind: "LOGO" as const }, select: { storageKey: true }, take: 1 },
  driver: { select: { vehicleType: true, vehicleModel: true, vehicleColor: true, plateNumber: true, ratingAvg: true, ratingCount: true, lastLat: true, lastLng: true, lastSeenAt: true, online: true } },
};

function safeOpen<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** The customer's own trip, with its exact points, code and (while active) the driver's position. */
export type CustomerTrip = NonNullable<Awaited<ReturnType<typeof tripForCustomer>>>;
export type DriverTrip = NonNullable<Awaited<ReturnType<typeof tripForDriver>>>;

export async function tripForCustomer(customerId: string, tripId: string) {
  const t = await prisma.trip.findFirst({
    where: { id: tripId, customerId },
    include: { driver: { select: driverCard }, messages: { orderBy: { createdAt: "asc" }, take: 100, select: { id: true, sender: true, body: true, createdAt: true } } },
  });
  if (!t) return null;
  const live = t.status === "ACCEPTED" || t.status === "ARRIVED" || t.status === "IN_PROGRESS";
  const d = t.driver?.driver;
  return {
    ...base(t),
    pickup: t.pickupSealed ? safeOpen(() => openPoint(t.pickupSealed!, P.pickup)) : null,
    dropoff: t.dropoffSealed ? safeOpen(() => openPoint(t.dropoffSealed!, P.dropoff)) : null,
    note: t.noteSealed ? safeOpen(() => open(t.noteSealed!, P.note)) : null,
    code: live && t.codeSealed ? safeOpen(() => open(t.codeSealed!, P.code)) : null,
    recipientName: t.recipientNameSealed ? safeOpen(() => open(t.recipientNameSealed!, P.rName)) : null,
    recipientPhone: t.recipientPhoneSealed ? safeOpen(() => open(t.recipientPhoneSealed!, P.rPhone)) : null,
    messages: t.messages,
    canChat: live && !!t.driverProviderId,
    driver: t.driver
      ? {
          name: t.driver.profile?.displayName ?? "",
          slug: t.driver.slug,
          verified: !!t.driver.verificationLevelId,
          phone: live ? (t.driver.profile?.phone ?? null) : null,
          whatsapp: live ? (t.driver.profile?.whatsapp ?? t.driver.profile?.phone ?? null) : null,
          logoUrl: t.driver.media[0] ? mediaUrl(t.driver.media[0].storageKey) : null,
          vehicle: d ? { type: d.vehicleType, model: d.vehicleModel, color: d.vehicleColor, plate: d.plateNumber } : null,
          rating: d ? { avg: d.ratingAvg, count: d.ratingCount } : null,
          position: live && d?.online && d.lastLat != null && d.lastLng != null ? { lat: d.lastLat, lng: d.lastLng, at: d.lastSeenAt } : null,
        }
      : null,
  };
}

function base(t: {
  id: string;
  kind: TripKind;
  status: string;
  vehicleType: VehicleType;
  pickupLabel: string;
  dropoffLabel: string;
  distanceKm: number;
  packageSize: string | null;
  packageDescription: string | null;
  fragile: boolean;
  fareEstimate: number | null;
  fareFinal: number | null;
  paymentMethod: string | null;
  rating: number | null;
  ratingComment: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  arrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  expiresAt: Date;
}) {
  return {
    id: t.id,
    kind: t.kind,
    status: t.status,
    vehicleType: t.vehicleType,
    pickupLabel: t.pickupLabel,
    dropoffLabel: t.dropoffLabel,
    distanceKm: t.distanceKm,
    packageSize: t.packageSize,
    packageDescription: t.packageDescription,
    fragile: t.fragile,
    fareEstimate: t.fareEstimate,
    fareFinal: t.fareFinal,
    paymentMethod: t.paymentMethod,
    rating: t.rating,
    ratingComment: t.ratingComment,
    createdAt: t.createdAt,
    acceptedAt: t.acceptedAt,
    arrivedAt: t.arrivedAt,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    cancelledAt: t.cancelledAt,
    cancelledBy: t.cancelledBy,
    expiresAt: t.expiresAt,
  };
}

/**
 * A trip as its driver sees it. Before accepting (an open offer) only labels and distances;
 * exact points and the customer's contact only once the trip is theirs and still active.
 */
export async function tripForDriver(providerId: string, tripId: string) {
  const t = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      customer: { select: { name: true, phone: true } },
      offers: { where: { providerId }, select: { id: true, status: true, distanceKm: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 100, select: { id: true, sender: true, body: true, createdAt: true } },
    },
  });
  if (!t) return null;
  const mine = t.driverProviderId === providerId;
  const offer = t.offers[0] ?? null;
  if (!mine && !(offer && offer.status === "OFFERED" && t.status === "REQUESTED")) return null;
  const active = mine && (t.status === "ACCEPTED" || t.status === "ARRIVED" || t.status === "IN_PROGRESS");
  const firstName = t.customer.name.trim().split(/\s+/)[0] ?? "";
  return {
    ...base(t),
    mine,
    offer: offer && !mine ? { id: offer.id, distanceKm: offer.distanceKm } : null,
    customerFirstName: firstName,
    customerPhone: active ? t.customer.phone : null,
    pickup: active && t.pickupSealed ? safeOpen(() => openPoint(t.pickupSealed!, P.pickup)) : null,
    dropoff: active && t.dropoffSealed ? safeOpen(() => openPoint(t.dropoffSealed!, P.dropoff)) : null,
    note: active && t.noteSealed ? safeOpen(() => open(t.noteSealed!, P.note)) : null,
    recipientName: active && t.recipientNameSealed ? safeOpen(() => open(t.recipientNameSealed!, P.rName)) : null,
    recipientPhone: active && t.recipientPhoneSealed ? safeOpen(() => open(t.recipientPhoneSealed!, P.rPhone)) : null,
    messages: mine ? t.messages : [],
    canChat: active,
  };
}

export async function listCustomerTrips(customerId: string, take = 30) {
  return prisma.trip.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, status: true, pickupLabel: true, dropoffLabel: true, distanceKm: true, fareEstimate: true, fareFinal: true, createdAt: true, expiresAt: true, rating: true, driver: { select: { profile: { select: { displayName: true } } } } },
  });
}

/** Open offers for this driver (newest first), with the fare their own rates would give. */
export async function listDriverOffers(providerId: string, now = new Date()) {
  const driver = await prisma.driverProfile.findUnique({ where: { providerId }, select: { baseFare: true, perKmFare: true } });
  const offers = await prisma.tripOffer.findMany({
    where: { providerId, status: "OFFERED", trip: { status: "REQUESTED", expiresAt: { gt: now } } },
    orderBy: { offeredAt: "desc" },
    take: 20,
    select: { id: true, distanceKm: true, offeredAt: true, trip: { select: { id: true, kind: true, vehicleType: true, pickupLabel: true, dropoffLabel: true, distanceKm: true, packageSize: true, fragile: true, expiresAt: true } } },
  });
  return offers.map((o) => ({ ...o, fare: driver ? fareFor(driver.baseFare, driver.perKmFare, o.trip.distanceKm) : null }));
}

export async function driverActiveTrip(providerId: string) {
  return prisma.trip.findFirst({ where: { driverProviderId: providerId, status: { in: ["ACCEPTED", "ARRIVED", "IN_PROGRESS"] } }, select: { id: true } });
}

export async function listDriverTrips(providerId: string, take = 30) {
  return prisma.trip.findMany({
    where: { driverProviderId: providerId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, status: true, pickupLabel: true, dropoffLabel: true, distanceKm: true, fareEstimate: true, fareFinal: true, paymentMethod: true, rating: true, createdAt: true },
  });
}

// ─── Background jobs ────────────────────────────────────────────────────────────────────────

export async function expireTrip(tripId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.trip.updateMany({ where: { id: tripId, status: "REQUESTED", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  if (!count) return false;
  await prisma.tripOffer.updateMany({ where: { tripId, status: "OFFERED" }, data: { status: "EXPIRED", respondedAt: now } });
  await notifyCustomer(tripId, "TRIP_EXPIRED");
  return true;
}

export async function redispatch(tripId: string, roundNo: number, now = new Date()): Promise<void> {
  const t = await prisma.trip.findUnique({ where: { id: tripId }, select: { status: true, expiresAt: true } });
  if (!t || t.status !== "REQUESTED" || t.expiresAt <= now) return;
  await dispatch(tripId, roundNo, now);
  // Rounds widen through DISPATCH_RADII_KM, then keep asking newly online drivers at the widest.
  if (now.getTime() + REDISPATCH_AFTER_SEC * 1000 < t.expiresAt.getTime()) {
    await enqueue("trip:redispatch", { tripId, round: roundNo + 1 }, { runAt: new Date(now.getTime() + REDISPATCH_AFTER_SEC * 1000), dedupeKey: `trip-redispatch:${tripId}:${roundNo + 1}` });
  }
}

/** Erases exact points, notes, recipient details and codes of finished trips (privacy retention). */
export async function purgeOldTrips(now = new Date()): Promise<number> {
  const days = (await getPlatformSettings()).tripPurgeDays ?? TRIP_PURGE_DAYS;
  const before = new Date(now.getTime() - days * 86_400_000);
  const { count } = await prisma.trip.updateMany({
    where: { purgedAt: null, status: { in: ["COMPLETED", "CANCELLED", "EXPIRED"] }, updatedAt: { lt: before } },
    data: { pickupSealed: null, dropoffSealed: null, noteSealed: null, recipientNameSealed: null, recipientPhoneSealed: null, codeSealed: null, purgedAt: now },
  });
  await prisma.tripMessage.deleteMany({ where: { trip: { purgedAt: { not: null } } } });
  return count;
}

/** Drivers who closed the app without going offline stop sharing their position (automation). */
export async function autoOfflineDrivers(afterMin: number, now = new Date()): Promise<number> {
  const { count } = await prisma.driverProfile.updateMany({
    where: { online: true, lastSeenAt: { lt: new Date(now.getTime() - afterMin * 60_000) } },
    data: { online: false, lastLat: null, lastLng: null, lastSeenAt: null },
  });
  return count;
}
