import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/dictionaries";
import { formatPrice, minutesToTime } from "@/lib/provider/format";
import { darClock, type Availability } from "@/lib/provider/availability";
import { formatDistance } from "@/lib/geo";
import type { ProviderCard as Card } from "@/lib/services/discovery";
import { RatingSummary, TrustBadges } from "@/components/trust/TrustBadges";
import { ConnectButton } from "@/components/connect/ConnectButton";

export function availabilityLabel(a: Availability, t: Dictionary): { text: string; tone: "open" | "closed" | "neutral" } | null {
  const c = t.discovery.card;
  switch (a.state) {
    case "OPEN":
      return { text: a.closesAt >= 1440 ? c.open : fill(c.closesAt, { time: minutesToTime(a.closesAt) }), tone: "open" };
    case "ALWAYS":
      return { text: c.always, tone: "open" };
    case "APPOINTMENT":
      return { text: c.appointment, tone: "neutral" };
    case "CLOSED": {
      if (!a.opensAt) return { text: c.closed, tone: "closed" };
      const time = minutesToTime(a.opensAt.minute);
      return a.opensAt.day === darClock().day
        ? { text: fill(c.opensToday, { time }), tone: "closed" }
        : { text: fill(c.opensAt, { day: t.profile.daysShort[a.opensAt.day - 1]!, time }), tone: "closed" };
    }
    default:
      return null; // No hours given: say nothing rather than guess.
  }
}

const TONE = {
  open: "bg-success-soft text-success",
  closed: "bg-canvas text-ink-muted",
  neutral: "bg-brand-50 text-brand-900",
};

/**
 * Provider card. Everything shown is the provider's own data: real review averages ("No reviews
 * yet" otherwise) and only earned badges (verified by GO BIG, top rated). Availability shows as
 * its own status pill, so it isn't repeated as a badge here.
 * Distance is measured to the provider's public point only (exact / ~500 m / area centre).
 */
export function ProviderCard({ p, t, locale, originArea = null }: { p: Card; t: Dictionary; locale: Locale; originArea?: string | null }) {
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const avail = availabilityLabel(p.availability, t);
  const areaText = p.area ? [p.area.name, p.area.district].filter(Boolean).join(", ") : null;
  // Stated only as precisely as the provider's public point allows (lib/geo formatDistance).
  const distanceText = p.distance
    ? p.distance.from === "you" || !originArea
      ? fill(t.location.away, { distance: formatDistance(p.distance.km, p.distance.precision) })
      : fill(t.location.fromArea, { distance: formatDistance(p.distance.km, p.distance.precision), area: originArea })
    : null;

  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-brand-500">
      <div className="flex gap-3 p-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-brand-50">
          {p.logoUrl || p.coverUrl ? (
            <Image src={(p.logoUrl ?? p.coverUrl)!} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-xl font-black text-brand-700">{p.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">
            {/* The whole card is clickable through this link's overlay. */}
            <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">
              {p.name}
            </Link>
          </h3>
          {p.badges.some((b) => b.kind === "VERIFIED" || b.kind === "TOP_RATED") && (
            <div className="mt-1">
              <TrustBadges badges={p.badges.filter((b) => b.kind === "VERIFIED" || b.kind === "TOP_RATED")} t={t} locale={locale} size="sm" />
            </div>
          )}
          {(p.service || p.category) && (
            <p className="truncate text-sm text-brand-700">{name((p.service ?? p.category)!)}</p>
          )}
          {areaText && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              {areaText}
              {distanceText && <span className="text-ink-subtle"> · {distanceText}</span>}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pb-3 text-xs">
        {p.price && <span className="font-semibold text-ink">{formatPrice(p.price, t.profile.priceLabels)}</span>}
        {avail && <span className={`rounded-full px-2 py-0.5 font-medium ${TONE[avail.tone]}`}>{avail.text}</span>}
        <RatingSummary avg={p.rating.avg} count={p.rating.count} t={t} compact />
      </div>

      {p.actions.length > 0 && (
        // Above the card's link overlay so the buttons stay tappable.
        <div className="relative z-10 mt-auto grid grid-cols-2 gap-2 border-t border-line p-3">
          {p.actions.map(({ action, href }) => (
            <ConnectButton
              key={action}
              slug={p.slug}
              action={action}
              href={href}
              label={t.profile.actions[action]}
              source="CARD"
              primary={action === "CALL"}
              className={`min-h-10 ${p.actions.length === 1 ? "col-span-2" : ""}`}
            />
          ))}
        </div>
      )}
    </article>
  );
}
