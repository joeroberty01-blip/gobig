import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MapPin } from "lucide-react";
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
  closed: "bg-surface/95 text-ink-muted",
  neutral: "bg-brand-50 text-brand-900",
};

/** Which buttons a card shows first when a provider enabled many (the profile has them all). */
const ACTION_ORDER: Card["actions"][number]["action"][] = ["WHATSAPP", "CALL", "REQUEST_QUOTE", "BOOK_SERVICE", "MESSAGE", "DIRECTIONS", "BOOK_RIDE", "WEBSITE", "EMAIL"];

/** Cover photo, else logo, else the business initial on the brand gradient — never a stock photo. */
function Photo({ p, sizes, className = "" }: { p: Card; sizes: string; className?: string }) {
  const src = p.coverUrl ?? p.logoUrl;
  return (
    <div className={`relative overflow-hidden bg-hero ${className}`}>
      {src ? (
        <Image src={src} alt="" fill sizes={sizes} className="object-cover transition duration-500 group-hover:scale-[1.03]" />
      ) : (
        <span className="grid size-full place-items-center text-4xl font-black text-white/90">{p.name.trim().slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

function VerifiedPill({ t, className = "" }: { t: Dictionary; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm ${className}`}>
      <BadgeCheck aria-hidden className="size-3.5" />
      {t.ui.home.verified}
    </span>
  );
}

/**
 * Provider card (Phase 14). Everything shown is the provider's own data: real review averages
 * ("No reviews yet" when there are none), only earned badges, their own price wording, and
 * availability from their hours. Distance is measured to the provider's public point only
 * (exact / ~500 m / area centre). `tile` = photo card for grids and carousels; `row` = compact
 * search result.
 */
export function ProviderCard({
  p,
  t,
  locale,
  originArea = null,
  variant = "tile",
}: {
  p: Card;
  t: Dictionary;
  locale: Locale;
  originArea?: string | null;
  variant?: "tile" | "row";
}) {
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const avail = availabilityLabel(p.availability, t);
  const verified = p.badges.some((b) => b.kind === "VERIFIED");
  const otherBadges = p.badges.filter((b) => b.kind === "TOP_RATED" || b.kind === "FAST_RESPONSE");
  const distanceText = p.distance
    ? p.distance.from === "you" || !originArea
      ? fill(t.location.away, { distance: formatDistance(p.distance.km, p.distance.precision) })
      : fill(t.location.fromArea, { distance: formatDistance(p.distance.km, p.distance.precision), area: originArea })
    : null;
  const areaText = p.area ? [p.area.name, p.area.district].filter(Boolean).join(", ") : null;
  const service = p.service ?? p.category;
  const price = p.price ? formatPrice(p.price, t.profile.priceLabels) : null;
  // "Ask for price" is information, not a price: shown quietly.
  const priceTone = p.price && price === t.profile.priceLabels.askForPrice ? "font-medium text-ink-muted" : "font-bold text-ink";
  const actions = [...p.actions].sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)).slice(0, 2);

  // The whole card is clickable through this link's overlay.
  const title = (
    <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
      {p.name}
    </Link>
  );
  const place = (areaText || distanceText) && (
    <span className="flex min-w-0 items-center gap-1 text-ink-muted">
      <MapPin aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{[areaText, distanceText].filter(Boolean).join(" · ")}</span>
    </span>
  );

  if (variant === "row") {
    return (
      <article className="group relative flex gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-500 sm:gap-4">
        <div className="relative shrink-0">
          <Photo p={p} sizes="128px" className="size-24 rounded-xl sm:h-28 sm:w-32" />
          {verified && <VerifiedPill t={t} className="absolute bottom-1.5 left-1.5 origin-bottom-left scale-90" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-base font-bold tracking-tight">{title}</h3>
          <div className="mt-0.5 text-sm">
            <RatingSummary avg={p.rating.avg} count={p.rating.count} t={t} compact />
          </div>
          {service && <p className="truncate text-xs text-ink-muted">{name(service)}</p>}
          {place && <p className="mt-1 text-xs">{place}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1.5">
            {avail && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[avail.tone]}`}>{avail.text}</span>}
            {price && <span className={`text-xs sm:hidden ${priceTone}`}>{price}</span>}
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 flex-col items-end justify-between gap-2">
          {price && <span className={`hidden max-w-40 text-right text-sm sm:block ${priceTone}`}>{price}</span>}
          {actions.length > 0 && (
            <div className="flex flex-col gap-2 sm:mt-auto sm:flex-row">
              {actions.map(({ action, href }) => (
                <ConnectButton key={action} slug={p.slug} action={action} href={href} label={t.profile.actions[action]} source="CARD" iconOnly />
              ))}
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-500">
      <div className="relative">
        <Photo p={p} sizes="(max-width: 640px) 80vw, 320px" className="aspect-[16/10]" />
        {verified && <VerifiedPill t={t} className="absolute top-2.5 left-2.5" />}
        {avail && <span className={`absolute right-2.5 bottom-2.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${TONE[avail.tone]}`}>{avail.text}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-base font-bold tracking-tight">{title}</h3>
        {service && <p className="truncate text-sm text-ink-muted">{name(service)}</p>}
        <div className="mt-2 flex flex-col gap-1 text-xs">
          <RatingSummary avg={p.rating.avg} count={p.rating.count} t={t} compact />
          {place}
        </div>
        {otherBadges.length > 0 && (
          <div className="mt-2">
            <TrustBadges badges={otherBadges} t={t} locale={locale} size="sm" />
          </div>
        )}
        {price && <p className={`mt-2 text-sm ${priceTone}`}>{price}</p>}
        {actions.length > 0 && (
          // Above the card's link overlay so the buttons stay tappable.
          <div className="relative z-10 mt-auto grid grid-cols-2 gap-2 pt-3">
            {actions.map(({ action, href }) => (
              <ConnectButton
                key={action}
                slug={p.slug}
                action={action}
                href={href}
                label={t.profile.actions[action]}
                source="CARD"
                primary={action === "CALL"}
                className={`min-h-10 ${actions.length === 1 ? "col-span-2" : ""}`}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
