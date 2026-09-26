import Link from "next/link";
import { Bell, Megaphone } from "lucide-react";
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
];

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
      (n.type === "ANNOUNCEMENT" && typeof data(n).announcementId === "string"),
  );
  const [labels, announcements] = await Promise.all([
    requestLabels(valid.map((n) => data(n).requestId).filter((x): x is string => !!x)),
    prisma.announcement.findMany({
      where: { id: { in: valid.map((n) => data(n).announcementId).filter((x): x is string => !!x) } },
      select: { id: true, titleEn: true, titleSw: true, bodyEn: true, bodySw: true },
    }),
  ]);
  const n = t.requests.notifications;
  const time = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const unread = valid.some((x) => !x.readAt);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={n.title} action={<MarkAllRead disabled={!unread} />} />
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
            const label = labels.get(d.requestId!);
            const service = label ? (locale === "sw" ? label.nameSw : label.nameEn) : n.fallbackService;
            return (
              <li key={x.id}>
                <Link href={`${basePath}/${d.requestId}`} className={`flex items-start gap-3 p-4 hover:bg-canvas ${tone}`}>
                  <Bell aria-hidden className={`mt-0.5 size-4 shrink-0 ${x.readAt ? "text-ink-subtle" : "text-brand-700"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${x.readAt ? "text-ink-muted" : "font-semibold text-ink"}`}>
                      {fill(n[x.type as Exclude<NotificationType, "ANNOUNCEMENT">], { service })}
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
