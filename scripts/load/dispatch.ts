// Phase 19: dispatch stress test — many customers request trips while many drivers accept at once.
//   npx tsx scripts/load/dispatch.ts [--customers 60] [--drivers 40]
// Runs against the TEST database only (refuses otherwise). Checks the invariants that matter under
// concurrency: no trip has two drivers, no driver holds two active trips, every accepted trip's
// offer is the only ACCEPTED one. Everything it creates is removed at the end.
import "dotenv/config";

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl || testUrl === process.env.DATABASE_URL) throw new Error("DATABASE_URL_TEST must be set and differ from DATABASE_URL.");
process.env.DATABASE_URL = testUrl;
process.env.DATABASE_URL_READ = "";
process.env.REDIS_URL = "";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : Number(fallback);
};
const CUSTOMERS = arg("customers", "60");
const DRIVERS = arg("drivers", "40");
const DOMAIN = ".load.test.gobig.local";
const run = `l${Date.now().toString(36)}`;

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : 0;
};

(async () => {
  // Imported after the environment points at the test database.
  const { prisma } = await import("@/lib/db");
  const trips = await import("@/lib/services/trips");
  const cleanup = async () => {
    await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: DOMAIN } } } } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  };
  await cleanup();

  const level = await prisma.verificationLevel.findFirstOrThrow({ where: { isActive: true }, orderBy: { rank: "asc" } });
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "parcel-delivery" } });
  const area = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
  const center = { lat: -6.819, lng: 39.274 };
  const jitter = (km: number) => ({ lat: center.lat + (Math.random() - 0.5) * (km / 111), lng: center.lng + (Math.random() - 0.5) * (km / 111) });

  console.log(`Setting up ${DRIVERS} online drivers and ${CUSTOMERS} customers…`);
  const driverIds: string[] = [];
  for (let i = 0; i < DRIVERS; i++) {
    const user = await prisma.user.create({ data: { name: `Load Driver ${i}`, email: `driver${i}-${run}${DOMAIN}`, passwordHash: "x", role: "PROVIDER" } });
    const p = await prisma.provider.create({
      data: {
        slug: `load-driver-${i}-${run}`,
        status: "ACTIVE",
        publishedAt: new Date(),
        verificationLevelId: level.id,
        verifiedAt: new Date(),
        members: { create: { userId: user.id, role: "OWNER" } },
        profile: { create: { displayName: `Load Driver ${i}`, primaryLocationId: area.id, primaryCategoryId: service.categoryId } },
      },
    });
    const at = jitter(4);
    await prisma.driverProfile.create({
      data: { providerId: p.id, offersRides: true, offersDelivery: true, vehicleType: "BODA", vehicleModel: "Load", vehicleColor: "Red", plateNumber: `MC ${i} LD`, baseFare: 1000, perKmFare: 500, online: true, lastLat: at.lat, lastLng: at.lng, lastSeenAt: new Date() },
    });
    driverIds.push(p.id);
  }
  const customerIds: string[] = [];
  for (let i = 0; i < CUSTOMERS; i++) customerIds.push((await prisma.user.create({ data: { name: `Load Customer ${i}`, email: `customer${i}-${run}${DOMAIN}`, passwordHash: "x", role: "CUSTOMER" } })).id);

  // 1. Every customer requests at the same moment.
  const requestMs: number[] = [];
  const t0 = Date.now();
  const created = await Promise.all(
    customerIds.map(async (id) => {
      const s = Date.now();
      const r = await trips.requestTrip({ id, role: "CUSTOMER", status: "ACTIVE" }, { kind: "RIDE", pickup: jitter(3), dropoff: jitter(12), vehicleType: "BODA" });
      requestMs.push(Date.now() - s);
      return r;
    }),
  );
  const requestWall = Date.now() - t0;
  const tripIds = created.flatMap((r) => (r.ok ? [r.tripId] : []));
  const failures = created.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.error));

  // 2. Every driver tries to accept every offer they got, all at once.
  const offers = await prisma.tripOffer.findMany({ where: { tripId: { in: tripIds } }, select: { id: true, providerId: true } });
  const acceptMs: number[] = [];
  const t1 = Date.now();
  const outcomes = await Promise.all(
    offers.map(async (o) => {
      const s = Date.now();
      const r = await trips.acceptOffer(o.providerId, o.id);
      acceptMs.push(Date.now() - s);
      return r.ok ? "won" : r.error;
    }),
  );
  const acceptWall = Date.now() - t1;

  // 3. Invariants.
  const rows = await prisma.trip.findMany({ where: { id: { in: tripIds } }, select: { id: true, status: true, driverProviderId: true } });
  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const perDriver = new Map<string, number>();
  for (const r of accepted) perDriver.set(r.driverProviderId!, (perDriver.get(r.driverProviderId!) ?? 0) + 1);
  const acceptedOffers = await prisma.tripOffer.groupBy({ by: ["tripId"], where: { tripId: { in: tripIds }, status: "ACCEPTED" }, _count: { _all: true } });
  const problems = [
    ...[...perDriver.entries()].filter(([, n]) => n > 1).map(([d, n]) => `driver ${d} holds ${n} active trips`),
    ...acceptedOffers.filter((g) => g._count._all > 1).map((g) => `trip ${g.tripId} has ${g._count._all} accepted offers`),
    ...accepted.filter((t) => !acceptedOffers.some((g) => g.tripId === t.id)).map((t) => `trip ${t.id} accepted without an accepted offer`),
  ];

  const tally = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}));
  console.log(`\nRequests: ${tripIds.length}/${CUSTOMERS} created in ${requestWall} ms wall — p50 ${pct(requestMs, 50)} ms, p95 ${pct(requestMs, 95)} ms, max ${pct(requestMs, 100)} ms`);
  if (failures.length) console.log(`  refused: ${JSON.stringify(tally(failures))}`);
  console.log(`Offers: ${offers.length} (≈${(offers.length / Math.max(1, tripIds.length)).toFixed(1)} per trip)`);
  console.log(`Accepts: ${offers.length} attempts in ${acceptWall} ms wall — p50 ${pct(acceptMs, 50)} ms, p95 ${pct(acceptMs, 95)} ms — ${JSON.stringify(tally(outcomes))}`);
  console.log(`Trips accepted: ${accepted.length} (drivers available: ${DRIVERS})`);
  console.log(problems.length ? `\nINVARIANT VIOLATIONS:\n  ${problems.join("\n  ")}` : "\nInvariants hold: no trip with two drivers, no driver with two trips.");

  await cleanup();
  await prisma.$disconnect();
  process.exitCode = problems.length ? 1 : 0;
})();
