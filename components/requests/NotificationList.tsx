import Link from "next/link";
import { Bell, Car, Megaphone, Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { fill, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import { listNotifications, type NotificationData, type NotificationType } from "@/lib/services/notifications";
import { requestLabels } from "@/lib/services/requests";
import { Card, PageHeader } from "@/components/ui";
import { MarkAllRead } from "./RequestActions";

const REQUEST_TYPES: NotificationType[] = [
  "REQUEST_NEW",
  "REQUEST_INTEREST",
  "QUOTE_NEW",
  "MESSAGE_NEW",
  "QUOTE_ACCEPTED",
  "REQUEST_NOT_SELECTED",
  "REQUEST_CANCELLED",
  "REQUEST_COMPLETED",
  "REQUEST_CANCELLED_BY_ADMIN",
  "REQUEST_REMINDER",
  "REQUEST_NO_RESPONSE",
  "REQUEST_CHOOSE_REMINDER",
  "REQUEST_DONE_CHECK",
  "REVIEW_INVITE",
];
const TRIP_TYPES: NotificationType[] = ["TRIP_OFFER", "TRIP_ACCEPTED", "TRIP_ARRIVED", "TRIP_STARTED", "TRIP_COMPLETED", "TRIP_CANCELLED", "TRIP_EXPIRED"];
type TripType = (typeof TRIP_TYPES)[number] & keyof Dictionary["trips"]["notif"];

/**
 * The signed-in user's notifications. Request notifications are written here in the reader's
 * language from the stored type + request id; announcements are NEXA's own text (Phase 12).
 */
export async function NotificationList({ userId, basePath, t, locale }: { userId: string; basePath: "/requests" | "/provider/requests"; t: Dictionary; locale: Locale }) {
  const rows = await listNotifications(userId);
  const data = (n: { data: unknown }) => (n.data ?? {}) as NotificationData;
  const valid = rows.filter(
    (n) =>
      (REQUEST_TYPES.includes(n.type as NotificationType) && typeof data(n).requestId === "string") ||
      (n.type === "ANNOUNCEMENT" && typeof data(n).announcementId === "string") ||
      (TRIP_TYPES.includes(n.type as NotificationType) && typeof data(n).tripId === "string"),
  );
  const [labels, announcements, trips] = await Promise.all([
    requestLabels(valid.map((n) => data(n).requestId).filter((x): x is string => !!x)),
    prisma.announcement.findMany({
      where: { id: { in: valid.map((n) => data(n).announcementId).filter((x): x is string => !!x) } },
      select: { id: true, titleEn: true, titleSw: true, bodyEn: true, bodySw: true },
    }),
    // Area labels only (never exact points); the notification itself was addressed to this user.
    prisma.trip.findMany({
      where: { id: { in: valid.map((n) => data(n).tripId).filter((x): x is string => !!x) } },
      select: { id: true, pickupLabel: true, dropoffLabel: true },
    }),
  ]);
  const n = t.requests.notifications;
  const time = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const unread = valid.some((x) => !x.readAt);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={n.title}
        action={
          <div className="flex items-center gap-2">
            <Link href={basePath === "/requests" ? "/account/notifications" : "/provider/account/notifications"} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-link hover:bg-canvas">
              <Settings aria-hidden className="size-4" />
              {t.notify.link}
            </Link>
            <MarkAllRead disabled={!unread} />
          </div>
        }
      />
      {valid.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{n.empty}</Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {valid.map((x) => {
            const d = data(x);
            const tone = x.readAt ? "" : "bg-brand-50";
            if (x.type === "ANNOUNCEMENT") {
              const a = announcements.find((y) => y.id === d.announcementId);
              if (!a) return null;
              return (
                <li key={x.id} className={`flex items-start gap-3 p-4 ${tone}`}>
                  <Megaphone aria-hidden className={`mt-0.5 size-4 shrink-0 ${x.readAt ? "text-ink-subtle" : "text-brand-700"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-brand-700">{n.fromGoBig}</span>
                    <span className={`block text-sm ${x.readAt ? "text-ink" : "font-semibold text-ink"}`}>{locale === "sw" ? a.titleSw : a.titleEn}</span>
                    <span className="mt-0.5 block text-sm whitespace-pre-line text-ink-muted">{locale === "sw" ? a.bodySw : a.bodyEn}</span>
                    <span className="text-xs text-ink-subtle">{time.format(x.createdAt)}</span>
                  </span>
                </li>
              );
            }
            if (TRIP_TYPES.includes(x.type as NotificationType)) {
              const trip = trips.find((y) => y.id === d.tripId);
              if (!trip) return null;
              const href = basePath === "/requests" ? `/trips/${trip.id}` : `/provider/driver/trips/${trip.id}`;
              return (
                <li key={x.id}>
                  <Link href={href} className={`flex items-start gap-3 p-4 hover:bg-canvas ${tone}`}>
                    <Car aria-hidden className={`mt-0.5 size-4 shrink-0 ${x.readAt ? "text-ink-subtle" : "text-brand-700"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${x.readAt ? "text-ink-muted" : "font-semibold text-ink"}`}>
                        {fill(t.trips.notif[x.type as TripType], { from: trip.pickupLabel, to: trip.dropoffLabel })}
                      </span>
                      <span className="text-xs text-ink-subtle">{time.format(x.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              );
            }
            const label = labels.get(d.requestId!);
            const service = label ? (locale === "sw" ? label.nameSw : label.nameEn) : n.fallbackService;
            return (
              <li key={x.id}>
                <Link href={`${basePath}/${d.requestId}`} className={`flex items-start gap-3 p-4 hover:bg-canvas ${tone}`}>
                  <Bell aria-hidden className={`mt-0.5 size-4 shrink-0 ${x.readAt ? "text-ink-subtle" : "text-brand-700"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${x.readAt ? "text-ink-muted" : "font-semibold text-ink"}`}>
                      {fill(n[x.type as Exclude<NotificationType, "ANNOUNCEMENT" | TripType>], { service })}
                    </span>
                    <span className="text-xs text-ink-subtle">{time.format(x.createdAt)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
