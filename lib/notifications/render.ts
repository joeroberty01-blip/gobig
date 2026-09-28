import { prisma } from "@/lib/db";
import { fill, getDictionary, type Locale } from "@/lib/i18n/dictionaries";
import type { NotificationData, NotificationType } from "@/lib/services/notifications";
import { requestLabels } from "@/lib/services/requests";

// Automation Engine, Phase C: the words and link for a push or email, in the reader's language,
// rebuilt from the notification's ids — the same text the in-app list shows. Nothing private
// (message text, phone numbers, exact places) goes into a push: pushes can show on a lock screen.

export type Rendered = { title: string; body: string; url: string };

const TRIP_TYPES = new Set<NotificationType>(["TRIP_OFFER", "TRIP_ACCEPTED", "TRIP_ARRIVED", "TRIP_STARTED", "TRIP_COMPLETED", "TRIP_CANCELLED", "TRIP_EXPIRED"]);

export async function renderNotification(n: { type: string; data: unknown }, reader: { role: string; locale: Locale }): Promise<Rendered | null> {
  const t = getDictionary(reader.locale);
  const type = n.type as NotificationType;
  const data = (n.data ?? {}) as NotificationData;
  const provider = reader.role === "PROVIDER";
  const title = t.app.name;

  if (type === "ANNOUNCEMENT") {
    if (!data.announcementId) return null;
    const a = await prisma.announcement.findUnique({ where: { id: data.announcementId }, select: { titleEn: true, titleSw: true } });
    if (!a) return null;
    return { title, body: reader.locale === "sw" ? a.titleSw : a.titleEn, url: provider ? "/provider/notifications" : "/notifications" };
  }

  const nudge = (t.notify.nudges as Record<string, string>)[type];
  if (nudge) {
    const href = type === "REVIEW_REPLY_REMINDER" ? "/provider/reviews" : type === "PROFILE_INCOMPLETE" ? "/provider/setup" : "/provider/requests";
    return { title, body: nudge, url: href };
  }

  if (TRIP_TYPES.has(type)) {
    if (!data.tripId) return null;
    const trip = await prisma.trip.findUnique({ where: { id: data.tripId }, select: { id: true, pickupLabel: true, dropoffLabel: true } });
    if (!trip) return null;
    const text = t.trips.notif[type as keyof typeof t.trips.notif];
    return { title, body: fill(text, { from: trip.pickupLabel, to: trip.dropoffLabel }), url: provider ? `/provider/driver/trips/${trip.id}` : `/trips/${trip.id}` };
  }

  if (!data.requestId) return null;
  const label = (await requestLabels([data.requestId])).get(data.requestId);
  const service = label ? (reader.locale === "sw" ? label.nameSw : label.nameEn) : t.requests.notifications.fallbackService;
  const text = (t.requests.notifications as Record<string, string>)[type];
  if (!text) return null;
  return { title, body: fill(text, { service }), url: provider ? `/provider/requests/${data.requestId}` : `/requests/${data.requestId}` };
}
