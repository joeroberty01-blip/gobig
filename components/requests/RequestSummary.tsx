import { CalendarClock, ImageIcon, MapPin, Wallet } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { formatTzs } from "@/lib/provider/format";

type Named = { nameEn: string; nameSw: string } | null;
type Status = "OPEN" | "EXPIRED" | "ACCEPTED" | "COMPLETED" | "CANCELLED";

export function requestTitle(r: { service: Named; category: Named }, locale: Locale, t: Dictionary): string {
  const n = r.service ?? r.category;
  return n ? (locale === "sw" ? n.nameSw : n.nameEn) : t.requests.notifications.fallbackService;
}

const TONES: Record<Status, string> = {
  OPEN: "bg-brand-50 text-brand-900",
  EXPIRED: "bg-canvas text-ink-muted",
  ACCEPTED: "bg-warning-soft text-warning",
  COMPLETED: "bg-success-soft text-success",
  CANCELLED: "bg-danger-soft text-danger",
};

export function StatusBadge({ status, t }: { status: Status; t: Dictionary }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[status]}`}>{t.requests.status[status]}</span>;
}

/** "Tue 3 Oct · 09:30". preferredDate is a calendar date (stored at UTC midnight). */
export function whenText(r: { preferredDate: Date | null; preferredTime: number | null }, locale: Locale, t: Dictionary): string {
  const parts: string[] = [];
  if (r.preferredDate) {
    parts.push(new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(r.preferredDate));
  }
  if (r.preferredTime != null) {
    parts.push(`${String(Math.floor(r.preferredTime / 60)).padStart(2, "0")}:${String(r.preferredTime % 60).padStart(2, "0")}`);
  }
  return parts.length ? parts.join(" · ") : t.requests.detail.anyTime;
}

export function budgetText(r: { budgetMin: number | null; budgetMax: number | null }, t: Dictionary): string {
  if (r.budgetMin != null && r.budgetMax != null) return r.budgetMin === r.budgetMax ? formatTzs(r.budgetMin) : `${formatTzs(r.budgetMin)} – ${formatTzs(r.budgetMax)}`;
  if (r.budgetMax != null) return `≤ ${formatTzs(r.budgetMax)}`;
  if (r.budgetMin != null) return `≥ ${formatTzs(r.budgetMin)}`;
  return t.requests.detail.noBudget;
}

export function areaText(location: { name: string; type: string; parent: { name: string } | null }): string {
  return location.parent && location.type !== "DISTRICT" ? `${location.name}, ${location.parent.name}` : location.name;
}

/** The request as both sides see it. Text is rendered as plain text (React escapes it). */
export function RequestDetails({
  r,
  t,
  locale,
  address,
}: {
  r: {
    description: string;
    preferredDate: Date | null;
    preferredTime: number | null;
    budgetMin: number | null;
    budgetMax: number | null;
    location: { name: string; type: string; parent: { name: string } | null };
    photos: { id: string }[];
  };
  t: Dictionary;
  locale: Locale;
  /** Only passed to the customer and the accepted provider. */
  address?: string | null;
}) {
  const d = t.requests.detail;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="leading-relaxed whitespace-pre-line text-ink">{r.description}</p>
      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <div>
            <dt className="text-xs text-ink-subtle">{d.when}</dt>
            <dd className="font-medium">{whenText(r, locale, t)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <div>
            <dt className="text-xs text-ink-subtle">{d.area}</dt>
            <dd className="font-medium">{areaText(r.location)}</dd>
            {address && <dd className="text-ink-muted">{address}</dd>}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Wallet aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <div>
            <dt className="text-xs text-ink-subtle">{d.budget}</dt>
            <dd className="font-medium">{budgetText(r, t)}</dd>
          </div>
        </div>
      </dl>
      {r.photos.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs text-ink-subtle">
            <ImageIcon aria-hidden className="size-3.5" />
            {d.photos}
          </p>
          <div className="flex flex-wrap gap-2">
            {r.photos.map((p, i) => (
              // Access-checked route → short-lived signed URL; never a public link.
              <a key={p.id} href={`/api/request-photos/${p.id}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/request-photos/${p.id}`}
                  alt={`${d.photos} ${i + 1}`}
                  className="size-20 rounded-lg border border-line object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
