import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { visibleActions, type ConnectAction } from "@/lib/provider/connect";

// Contact-button analytics (Phase 6). Counts PEOPLE per button per day, not raw taps:
// one row per (provider, action, visitor, day), inserted with ON CONFLICT DO NOTHING, so tapping
// repeatedly can't inflate a provider's numbers. The visitor hash mixes a secret salt, the day and
// the provider id into a random cookie value — it can't be reversed or linked across days or
// providers, and no IP or account id is stored.

export type ConnectSourceKind = "PROFILE" | "CARD" | "MAP";

/** Calendar day in Dar es Salaam (UTC+3), as a UTC-midnight Date for the @db.Date column. */
export function darDay(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function visitorHash(visitorId: string, providerId: string, day: Date): string {
  const salt = process.env.ANALYTICS_SALT || process.env.AUTH_SECRET || "";
  return createHash("sha256").update(`${salt}|${day.toISOString().slice(0, 10)}|${providerId}|${visitorId}`).digest("hex").slice(0, 40);
}

export type RecordResult = { recorded: boolean; reason?: "notFound" | "notOffered" | "ownOrStaff" };

/**
 * Records one tap if — and only if — the provider is live and actually shows that button now.
 * Taps by the provider's own members and by admins are ignored so they can't inflate numbers.
 */
export async function recordConnect(input: {
  slug: string;
  action: ConnectAction;
  source: ConnectSourceKind;
  visitorId: string;
  viewer: { id: string; role: string } | null;
  now?: Date;
}): Promise<RecordResult> {
  const p = await prisma.provider.findFirst({
    where: { slug: input.slug, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      members: { select: { userId: true } },
      profile: {
        select: {
          phone: true,
          whatsapp: true,
          website: true,
          email: true,
          bookingUrl: true,
          rideUrl: true,
          addressText: true,
          latitude: true,
          longitude: true,
          locationVisibility: true,
          enabledActions: true,
        },
      },
    },
  });
  if (!p?.profile) return { recorded: false, reason: "notFound" };

  const pr = p.profile;
  const exact = pr.locationVisibility === "EXACT";
  const offered = visibleActions(pr.enabledActions, {
    ...pr,
    addressText: exact ? pr.addressText : null,
    latitude: exact && pr.latitude != null ? Number(pr.latitude) : null,
    longitude: exact && pr.longitude != null ? Number(pr.longitude) : null,
    areaName: null,
  });
  if (!offered.includes(input.action)) return { recorded: false, reason: "notOffered" };

  if (input.viewer && (input.viewer.role === "ADMIN" || input.viewer.role === "SUPER_ADMIN" || p.members.some((m) => m.userId === input.viewer!.id))) {
    return { recorded: false, reason: "ownOrStaff" };
  }

  const day = darDay(input.now);
  const res = await prisma.connectEvent.createMany({
    data: [{ providerId: p.id, action: input.action, source: input.source, day, visitorHash: visitorHash(input.visitorId, p.id, day) }],
    skipDuplicates: true,
  });
  return { recorded: res.count === 1 };
}

/** People per button over the last `days` days (Dar calendar days, today included). */
export async function connectStats(providerId: string, days = 30, now: Date = new Date()) {
  const since = new Date(darDay(now).getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const rows = await prisma.connectEvent.groupBy({
    by: ["action"],
    where: { providerId, day: { gte: since } },
    _count: { _all: true },
  });
  const byAction = Object.fromEntries(rows.map((r) => [r.action, r._count._all])) as Partial<Record<ConnectAction, number>>;
  return { byAction, total: rows.reduce((n, r) => n + r._count._all, 0) };
}

