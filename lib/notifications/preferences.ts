import { z } from "zod";
import { prisma } from "@/lib/db";
import type { NotificationCategory, NotificationChannel } from "@/generated/prisma/client";
import type { NotificationType } from "@/lib/services/notifications";

// Automation Engine, Phase C: who gets what, where, and when.
// In-app notifications always appear (they're the record). Push and email follow the person's
// preferences per category, quiet hours (Dar es Salaam time) and daily caps. Urgent live-trip
// updates skip quiet hours and caps — someone is waiting at the roadside.

export const CATEGORIES = ["REQUESTS", "MESSAGES", "TRIPS", "REVIEWS", "REMINDERS", "ACCOUNT", "SUMMARIES", "MARKETING"] as const satisfies readonly NotificationCategory[];

export const TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  REQUEST_NEW: "REQUESTS",
  REQUEST_INTEREST: "REQUESTS",
  QUOTE_NEW: "REQUESTS",
  MESSAGE_NEW: "MESSAGES",
  QUOTE_ACCEPTED: "REQUESTS",
  REQUEST_NOT_SELECTED: "REQUESTS",
  REQUEST_CANCELLED: "REQUESTS",
  REQUEST_COMPLETED: "REQUESTS",
  REQUEST_CANCELLED_BY_ADMIN: "ACCOUNT",
  REQUEST_REMINDER: "REMINDERS",
  REQUEST_NO_RESPONSE: "REMINDERS",
  REQUEST_CHOOSE_REMINDER: "REMINDERS",
  REQUEST_DONE_CHECK: "REMINDERS",
  REVIEW_INVITE: "REVIEWS",
  BOOKING_PROPOSED: "REQUESTS",
  BOOKING_CONFIRMED: "REQUESTS",
  BOOKING_CANCELLED: "REQUESTS",
  BOOKING_REMINDER: "REMINDERS",
  BOOKING_AT_RISK: "REQUESTS",
  REVIEW_REPLY_REMINDER: "REVIEWS",
  PROFILE_INCOMPLETE: "REMINDERS",
  PROVIDER_INACTIVE: "REMINDERS",
  ANNOUNCEMENT: "ACCOUNT",
  TRIP_OFFER: "TRIPS",
  TRIP_ACCEPTED: "TRIPS",
  TRIP_ARRIVED: "TRIPS",
  TRIP_STARTED: "TRIPS",
  TRIP_COMPLETED: "TRIPS",
  TRIP_CANCELLED: "TRIPS",
  TRIP_EXPIRED: "TRIPS",
};

/** Sent at once, whatever the hour or the day's count. */
export const URGENT: ReadonlySet<NotificationType> = new Set(["TRIP_OFFER", "TRIP_ACCEPTED", "TRIP_ARRIVED", "TRIP_STARTED", "TRIP_CANCELLED"]);

export const DAILY_CAP: Record<NotificationChannel, number> = { PUSH: 30, EMAIL: 10 };
export const DEFAULT_QUIET = { start: 21 * 60, end: 7 * 60 };

export type CategoryPrefs = { push: boolean; email: boolean };
export type Preferences = { categories: Record<NotificationCategory, CategoryPrefs>; quietStart: number | null; quietEnd: number | null };

/** Push on for everything except marketing; email is opt-in; quiet 21:00–07:00. */
export function defaultPreferences(): Preferences {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { push: c !== "MARKETING", email: false }])) as Preferences["categories"];
  return { categories, quietStart: DEFAULT_QUIET.start, quietEnd: DEFAULT_QUIET.end };
}

export async function getPreferences(userId: string): Promise<Preferences> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const prefs = defaultPreferences();
  for (const r of rows) {
    prefs.categories[r.category] = { push: r.push, email: r.email };
    prefs.quietStart = r.quietStart;
    prefs.quietEnd = r.quietEnd;
  }
  return prefs;
}

const minute = z.number().int().min(0).max(1439);
export const preferencesSchema = z
  .object({
    categories: z.record(z.enum(CATEGORIES), z.object({ push: z.boolean(), email: z.boolean() })),
    quietStart: minute.nullable(),
    quietEnd: minute.nullable(),
  })
  .refine((v) => (v.quietStart === null) === (v.quietEnd === null), { path: ["quietEnd"] });

/** The person's own choices (the caller passes the session's user id). */
export async function savePreferences(userId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const merged = defaultPreferences();
  for (const [c, v] of Object.entries(parsed.data.categories)) merged.categories[c as NotificationCategory] = v;
  await prisma.$transaction(
    CATEGORIES.map((category) =>
      prisma.notificationPreference.upsert({
        where: { userId_category: { userId, category } },
        create: { userId, category, ...merged.categories[category], quietStart: parsed.data.quietStart, quietEnd: parsed.data.quietEnd },
        update: { ...merged.categories[category], quietStart: parsed.data.quietStart, quietEnd: parsed.data.quietEnd },
      }),
    ),
  );
  return { ok: true };
}

// ─── Time (Dar es Salaam, UTC+3, no daylight saving) ────────────────────────────────────────

const EAT_MS = 3 * 60 * 60_000;
const minutesInDar = (d: Date) => Math.floor(((d.getTime() + EAT_MS) % 86_400_000) / 60_000);

/** Start of today in Dar es Salaam, as an instant. */
export function darDayStart(now: Date): Date {
  const local = now.getTime() + EAT_MS;
  return new Date(local - (local % 86_400_000) - EAT_MS);
}

/** When quiet hours end if `now` is inside them, else null. Handles windows across midnight. */
export function quietUntil(prefs: Pick<Preferences, "quietStart" | "quietEnd">, now: Date): Date | null {
  const { quietStart: s, quietEnd: e } = prefs;
  if (s === null || e === null || s === e) return null;
  const m = minutesInDar(now);
  const inside = s < e ? m >= s && m < e : m >= s || m < e;
  if (!inside) return null;
  const wait = (e - m + 1440) % 1440;
  const until = new Date(now.getTime() + wait * 60_000);
  until.setUTCSeconds(0, 0);
  return until;
}
