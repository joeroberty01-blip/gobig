import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import * as trips from "@/lib/services/trips";

// Phase 17 rides & deliveries against the test branch. Every row belongs to this run's users.
const run = `t${Date.now().toString(36)}`;
const domain = ".trips.test.gobig.local";

const KARIAKOO = { lat: -6.819, lng: 39.274 };
const MIKOCHENI = { lat: -6.77, lng: 39.245 };
const NEAR_KARIAKOO = { lat: -6.821, lng: 39.276 };
const FAR_AWAY = { lat: -6.62, lng: 39.12 }; // ~27 km north-west

let customerId: string;
let customer2Id: string;
const drivers: Record<"a" | "b" | "c" | "far", string> = { a: "", b: "", c: "", far: "" };
let levelId: string;

const customer = (id: string) => ({ id, role: "CUSTOMER", status: "ACTIVE" });
const vehicle = { offersRides: true, offersDelivery: true, vehicleType: "BODA", vehicleModel: "TVS HLX 125", vehicleColor: "Red", plateNumber: "mc 123 abc", baseFare: 2000, perKmFare: 500 };

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER", phone?: string) {
  return (await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, phone: phone ?? null, passwordHash: "x", role } })).id;
}

async function driverBusiness(name: string) {
  const userId = await makeUser(`Owner ${name}`, "PROVIDER");
  const { providerId } = await profile.saveBusinessName(userId, `${name} ${run}`);
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "parcel-delivery" } });
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.saveDescription(providerId, "Trips integration test driver, removed after the run.");
  await profile.saveContact(providerId, "255700000800", null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  expect(await profile.publishProvider(providerId)).toEqual({ ok: true });
  return providerId;
}

const verify = (providerId: string) => prisma.provider.update({ where: { id: providerId }, data: { verificationLevelId: levelId, verifiedAt: new Date() } });

async function cleanup() {
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: domain } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

beforeAll(async () => {
  await cleanup();
  levelId = (await prisma.verificationLevel.findFirstOrThrow({ where: { isActive: true }, orderBy: { rank: "asc" } })).id;
  customerId = await makeUser("Asha Mushi", "CUSTOMER", "255711000111");
  customer2Id = await makeUser("Other Rider", "CUSTOMER");
  for (const k of ["a", "b", "c", "far"] as const) drivers[k] = await driverBusiness(`Driver ${k.toUpperCase()}`);
}, 180_000);

afterAll(cleanup);

describe("going online", () => {
  it("needs a driver profile, verification and a position in Dar", async () => {
    expect(await trips.setOnline(drivers.a, true, NEAR_KARIAKOO)).toEqual({ ok: false, error: "notVerified" });
    await verify(drivers.a);
    expect(await trips.setOnline(drivers.a, true, NEAR_KARIAKOO)).toEqual({ ok: false, error: "noDriverProfile" });
    expect(await trips.saveDriverProfile(drivers.a, { ...vehicle, baseFare: -1 })).toEqual({ ok: false, error: "invalid" });
    expect(await trips.saveDriverProfile(drivers.a, vehicle)).toEqual({ ok: true });
    expect(await trips.setOnline(drivers.a, true, { lat: 51.5, lng: -0.12 })).toEqual({ ok: false, error: "outsideArea" });
    expect(await trips.setOnline(drivers.a, true, NEAR_KARIAKOO)).toEqual({ ok: true });
    expect((await trips.getDriverProfile(drivers.a))?.plateNumber).toBe("MC 123 ABC");
  });

  it("sample businesses can never drive", async () => {
    await prisma.provider.update({ where: { id: drivers.c }, data: { isDemo: true } });
    await verify(drivers.c);
    await trips.saveDriverProfile(drivers.c, vehicle);
    expect(await trips.setOnline(drivers.c, true, NEAR_KARIAKOO)).toEqual({ ok: false, error: "notAllowed" });
  });

  it("going offline forgets the position", async () => {
    for (const k of ["b", "far"] as const) {
      await verify(drivers[k]);
      await trips.saveDriverProfile(drivers[k], vehicle);
    }
    await trips.setOnline(drivers.b, true, KARIAKOO);
    await trips.setOnline(drivers.far, true, FAR_AWAY);
    await trips.setOnline(drivers.far, false);
    const far = await trips.getDriverProfile(drivers.far);
    expect(far).toMatchObject({ online: false, lastLat: null, lastLng: null });
    await trips.setOnline(drivers.far, true, FAR_AWAY);
  });
});

describe("a ride", () => {
  let tripId: string;

  it("validates the request", async () => {
    const ride = { kind: "RIDE", pickup: KARIAKOO, dropoff: MIKOCHENI, vehicleType: "BODA" };
    expect(await trips.requestTrip(customer(customerId), { ...ride, pickup: { lat: 40, lng: 10 } })).toEqual({ ok: false, error: "outsideArea" });
    expect(await trips.requestTrip(customer(customerId), { ...ride, dropoff: { lat: -6.8191, lng: 39.2741 } })).toEqual({ ok: false, error: "tooShort" });
    expect(await trips.requestTrip({ id: drivers.a, role: "PROVIDER", status: "ACTIVE" }, ride)).toEqual({ ok: false, error: "notAllowed" });
    const r = await trips.requestTrip(customer(customerId), { ...ride, note: "Geti la bluu" });
    expect(r.ok).toBe(true);
    if (r.ok) tripId = r.tripId;
  });

  it("stores exact points encrypted and offers only nearby, eligible drivers", async () => {
    const row = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(row.pickupSealed).toMatch(/^e1\./);
    expect(row.pickupSealed).not.toContain("39.274");
    expect(row.pickupLatCoarse).toBe(-6.82);
    const offered = (await prisma.tripOffer.findMany({ where: { tripId } })).map((o) => o.providerId).sort();
    expect(offered).toEqual([drivers.a, drivers.b].sort()); // not the sample (c), not the far one
  });

  it("nobody else can read it; an offered driver sees no exact points", async () => {
    expect(await trips.tripForCustomer(customer2Id, tripId)).toBeNull();
    expect(await trips.tripForDriver(drivers.far, tripId)).toBeNull();
    const asOffered = await trips.tripForDriver(drivers.a, tripId);
    expect(asOffered).toMatchObject({ mine: false, pickup: null, dropoff: null, note: null, customerPhone: null });
    const own = await trips.tripForCustomer(customerId, tripId);
    expect(own?.pickup).toEqual(KARIAKOO);
    expect(own?.note).toBe("Geti la bluu");
  });

  it("exactly one of two drivers accepting at once wins", async () => {
    const offers = await prisma.tripOffer.findMany({ where: { tripId } });
    const offerOf = (p: string) => offers.find((o) => o.providerId === p)!.id;
    const [ra, rb] = await Promise.all([trips.acceptOffer(drivers.a, offerOf(drivers.a)), trips.acceptOffer(drivers.b, offerOf(drivers.b))]);
    expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1);
    const loser = ra.ok ? rb : ra;
    expect(loser).toEqual({ ok: false, error: "taken" });
    const row = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    // Swap roles so the rest of the test drives with whoever won.
    if (row.driverProviderId === drivers.b) [drivers.a, drivers.b] = [drivers.b, drivers.a];
    expect(row).toMatchObject({ status: "ACCEPTED", driverProviderId: drivers.a, fareEstimate: trips.fareFor(2000, 500, row.distanceKm) });
  });

  it("the winner now sees exact points and the customer's phone; the loser sees nothing", async () => {
    const d = await trips.tripForDriver(drivers.a, tripId);
    expect(d).toMatchObject({ mine: true, pickup: KARIAKOO, customerPhone: "255711000111", customerFirstName: "Asha" });
    expect(await trips.tripForDriver(drivers.b, tripId)).toBeNull();
  });

  it("steps can't be skipped, and the ride starts only with the rider's PIN", async () => {
    expect(await trips.startTrip(drivers.a, tripId, "0000")).toEqual({ ok: false, error: expect.stringMatching(/wrongCode|notAllowed/) });
    expect(await trips.markArrived(drivers.b, tripId)).toEqual({ ok: false, error: "notAllowed" });
    expect(await trips.markArrived(drivers.a, tripId)).toEqual({ ok: true });
    const pin = (await trips.tripForCustomer(customerId, tripId))!.code!;
    expect(pin).toMatch(/^\d{4}$/);
    const wrong = pin === "1234" ? "4321" : "1234";
    expect(await trips.startTrip(drivers.a, tripId, wrong)).toEqual({ ok: false, error: "wrongCode" });
    expect(await trips.startTrip(drivers.a, tripId, pin)).toEqual({ ok: true });
  });

  it("completes with the recorded fare, then the customer rates once", async () => {
    expect(await trips.completeTrip(drivers.a, tripId, { fareFinal: 5000, paymentMethod: "BITCOIN" })).toEqual({ ok: false, error: "invalid" });
    expect(await trips.completeTrip(drivers.a, tripId, { fareFinal: 5000, paymentMethod: "MPESA" })).toEqual({ ok: true });
    expect(await trips.rateTrip(customer2Id, tripId, { rating: 1 })).toEqual({ ok: false, error: "notFound" });
    expect(await trips.rateTrip(customerId, tripId, { rating: 6 })).toEqual({ ok: false, error: "invalid" });
    expect(await trips.rateTrip(customerId, tripId, { rating: 5, comment: "Safi sana" })).toEqual({ ok: true });
    expect(await trips.rateTrip(customerId, tripId, { rating: 1 })).toEqual({ ok: false, error: "alreadyRated" });
    expect(await trips.getDriverProfile(drivers.a)).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    // After completion the code and live position are no longer shown.
    expect(await trips.tripForCustomer(customerId, tripId)).toMatchObject({ code: null, status: "COMPLETED", fareFinal: 5000 });
  });
});

describe("a delivery", () => {
  let tripId: string;
  const delivery = {
    kind: "DELIVERY",
    pickup: KARIAKOO,
    dropoff: MIKOCHENI,
    vehicleType: "BODA",
    packageSize: "SMALL",
    packageDescription: "Nyaraka kwenye bahasha",
    fragile: false,
    recipientName: "Juma Hassan",
    recipientPhone: "0754 123 456",
  };

  it("keeps the recipient private until a driver accepts", async () => {
    expect(await trips.requestTrip(customer(customerId), { ...delivery, recipientPhone: "hello" })).toEqual({ ok: false, error: "invalid" });
    const r = await trips.requestTrip(customer(customerId), delivery);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    tripId = r.tripId;
    const row = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(row.recipientPhoneSealed).not.toContain("754");
    expect(await trips.tripForDriver(drivers.a, tripId)).toMatchObject({ recipientName: null, recipientPhone: null });
  });

  it("is handed over only with the recipient's code", async () => {
    const offer = await prisma.tripOffer.findFirstOrThrow({ where: { tripId, providerId: drivers.a } });
    expect((await trips.acceptOffer(drivers.a, offer.id)).ok).toBe(true);
    expect(await trips.tripForDriver(drivers.a, tripId)).toMatchObject({ recipientName: "Juma Hassan", recipientPhone: "255754123456" });
    await trips.markArrived(drivers.a, tripId);
    expect(await trips.startTrip(drivers.a, tripId)).toEqual({ ok: true }); // picked up: no code
    const code = (await trips.tripForCustomer(customerId, tripId))!.code!;
    expect(await trips.completeTrip(drivers.a, tripId, { fareFinal: 4000, paymentMethod: "CASH", code: "99999" })).toEqual({ ok: false, error: "wrongCode" });
    expect(await trips.completeTrip(drivers.a, tripId, { fareFinal: 4000, paymentMethod: "CASH", code })).toEqual({ ok: true });
  });
});

describe("limits, cancelling, expiry and retention", () => {
  const ride = { kind: "RIDE", pickup: KARIAKOO, dropoff: MIKOCHENI, vehicleType: "CAR" };

  it("caps active trips per customer and lets the customer cancel", async () => {
    const ids: string[] = [];
    for (let i = 0; i < trips.MAX_ACTIVE_TRIPS; i++) {
      const r = await trips.requestTrip(customer(customer2Id), ride);
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.tripId);
    }
    expect(await trips.requestTrip(customer(customer2Id), ride)).toEqual({ ok: false, error: "tooManyActive" });
    expect(await trips.cancelByCustomer(customerId, ids[0]!)).toEqual({ ok: false, error: "notFound" });
    expect(await trips.cancelByCustomer(customer2Id, ids[0]!)).toEqual({ ok: true });
    expect(await trips.cancelByCustomer(customer2Id, ids[0]!)).toEqual({ ok: false, error: "notAllowed" });
  });

  it("expires unanswered requests", async () => {
    const r = await trips.requestTrip(customer(customer2Id), ride);
    if (!r.ok) {
      // The cap from the previous test may still hold one active trip; cancel it and retry.
      const open = await prisma.trip.findFirstOrThrow({ where: { customerId: customer2Id, status: "REQUESTED" } });
      await trips.cancelByCustomer(customer2Id, open.id);
    }
    const trip = await prisma.trip.findFirstOrThrow({ where: { customerId: customer2Id, status: "REQUESTED" }, orderBy: { createdAt: "desc" } });
    expect(await trips.expireTrip(trip.id)).toBe(false); // not due yet
    expect(await trips.expireTrip(trip.id, new Date(Date.now() + 11 * 60_000))).toBe(true);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe("EXPIRED");
  });

  it("erases exact data of old finished trips", async () => {
    const done = await prisma.trip.findMany({ where: { customerId, status: "COMPLETED" }, select: { id: true } });
    await prisma.trip.updateMany({ where: { id: { in: done.map((d) => d.id) } }, data: { updatedAt: new Date(Date.now() - 40 * 86_400_000) } });
    // updatedAt is @updatedAt: set it with raw SQL so Prisma doesn't overwrite it.
    await prisma.$executeRaw`UPDATE "Trip" SET "updatedAt" = now() - interval '40 days' WHERE "customerId" = ${customerId} AND "status" = 'COMPLETED'`;
    await trips.purgeOldTrips();
    const rows = await prisma.trip.findMany({ where: { id: { in: done.map((d) => d.id) } } });
    for (const t of rows) expect(t).toMatchObject({ pickupSealed: null, dropoffSealed: null, recipientPhoneSealed: null, codeSealed: null });
    expect(rows.every((t) => t.purgedAt)).toBe(true);
    // The trip history itself (labels, fare, rating) stays.
    expect(rows.some((t) => t.rating === 5)).toBe(true);
  });
});
