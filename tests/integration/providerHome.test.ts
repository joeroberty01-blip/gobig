import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { darStartOfDay, providerUpcomingBookings } from "@/lib/services/bookings";
import { providerJobsSummary } from "@/lib/services/requests";

// Design wave 3: the provider dashboard's week of bookings and finished jobs, on the test branch.
const run = `h${Date.now().toString(36)}`;
const domain = ".home.test.gobig.local";
let providerId: string;
let otherProviderId: string;
let customerId: string;
const now = new Date("2026-10-10T09:00:00Z"); // 12:00 in Dar

async function cleanup() {
  await prisma.serviceRequest.deleteMany({ where: { description: { contains: run } } });
  await prisma.provider.deleteMany({ where: { slug: { startsWith: `home-biz-${run}` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
}

async function request(opts: { status: "OPEN" | "ACCEPTED" | "COMPLETED"; completedAt?: Date; quote?: number; booking?: { at: Date; status: "PENDING" | "CONFIRMED" | "CANCELLED" } }) {
  const location = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const r = await prisma.serviceRequest.create({
    data: {
      customerId,
      categoryId: category.id,
      description: `Kazi ${run}`,
      locationId: location.id,
      expiresAt: new Date(now.getTime() + 86_400_000),
      status: opts.status,
      acceptedProviderId: opts.status === "OPEN" ? null : providerId,
      acceptedAt: opts.status === "OPEN" ? null : now,
      completedAt: opts.completedAt ?? null,
    },
  });
  if (opts.quote) await prisma.quote.create({ data: { requestId: r.id, providerId, amount: opts.quote, status: "ACCEPTED" } });
  if (opts.booking) await prisma.booking.create({ data: { requestId: r.id, customerId, providerId, scheduledAt: opts.booking.at, status: opts.booking.status, proposedBy: "PROVIDER" } });
  return r.id;
}

beforeAll(async () => {
  await cleanup();
  customerId = (await prisma.user.create({ data: { name: "Home Customer", email: `c-${run}${domain}`, passwordHash: "x" } })).id;
  providerId = (await prisma.provider.create({ data: { slug: `home-biz-${run}`, status: "ACTIVE" } })).id;
  otherProviderId = (await prisma.provider.create({ data: { slug: `home-biz-${run}-other`, status: "ACTIVE" } })).id;
  const day = 86_400_000;
  await request({ status: "ACCEPTED", booking: { at: new Date(now.getTime() + 2 * 3_600_000), status: "CONFIRMED" } }); // today
  await request({ status: "ACCEPTED", booking: { at: new Date(now.getTime() + 3 * day), status: "PENDING" } }); // in 3 days
  await request({ status: "ACCEPTED", booking: { at: new Date(now.getTime() + 10 * day), status: "CONFIRMED" } }); // too far
  await request({ status: "ACCEPTED", booking: { at: new Date(now.getTime() + day), status: "CANCELLED" } }); // cancelled
  await request({ status: "COMPLETED", completedAt: new Date(now.getTime() - 5 * day), quote: 40000 });
  await request({ status: "COMPLETED", completedAt: new Date(now.getTime() - 2 * day) }); // no price on Go Big
  await request({ status: "COMPLETED", completedAt: new Date(now.getTime() - 45 * day), quote: 99000 }); // too old
});
afterAll(cleanup);

describe("provider dashboard data", () => {
  it("today starts at midnight in Dar es Salaam", () => {
    expect(darStartOfDay(now).toISOString()).toBe("2026-10-09T21:00:00.000Z");
    expect(darStartOfDay(new Date("2026-10-10T22:30:00Z")).toISOString()).toBe("2026-10-10T21:00:00.000Z");
  });

  it("lists this week's proposed and confirmed bookings, soonest first, and nothing else", async () => {
    const list = await providerUpcomingBookings(providerId, now);
    expect(list.map((b) => b.status)).toEqual(["CONFIRMED", "PENDING"]);
    expect(await providerUpcomingBookings(otherProviderId, now)).toEqual([]);
  });

  it("counts finished jobs in 30 days and totals only accepted prices", async () => {
    expect(await providerJobsSummary(providerId, 30, now)).toEqual({ jobs: 2, agreedTotal: 40000, withoutPrice: 1 });
    expect(await providerJobsSummary(otherProviderId, 30, now)).toEqual({ jobs: 0, agreedTotal: 0, withoutPrice: 0 });
  });
});
