import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/dictionaries";
import { formatPrice, formatTzs, minutesToTime } from "@/lib/provider/format";
import { darClock, type Availability } from "@/lib/provider/availability";
import { formatDistance } from "@/lib/geo";
import type { ProviderCard as Card } from "@/lib/services/discovery";
import { ConnectButton } from "@/components/connect/ConnectButton";
import { CompareToggle } from "@/components/discovery/Compare";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";

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

/** Marks a test-deployment sample business. */
export function SampleTag({ t }: { t: Dictionary }) {
  return <span className="shrink-0 rounded-full bg-cta/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-cta uppercase">{t.ui.demo.tag}</span>;
}

function VerifiedPill({ t, className = "", light = false }: { t: Dictionary; className?: string; light?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase shadow-sm ${
        light ? "bg-white text-brand-700" : "bg-brand-600 text-white"
      } ${className}`}
    >
      <BadgeCheck aria-hidden className="size-3" />
      {t.ui.home.verified}
    </span>
  );
}

/**
 * Provider card (approved design, 2026-09-26). Everything shown is the provider's own data: real
 * review averages ("No reviews yet" when there are none), only earned badges, their own price
 * wording, availability from their hours, distance only as precise as their public point.
 * `tile` = photo card for the home carousel and grids (Verified on the photo, ♥ to save);
 * `row` = search result with WhatsApp / Call buttons and the price on the right.
 */
export function ProviderCard({
  p,
  t,
  locale,
  originArea = null,
  variant = "tile",
  save,
  requestHref,
}: {
  p: Card;
  t: Dictionary;
  locale: Locale;
  originArea?: string | null;
  variant?: "tile" | "row" | "list";
  /** Show the ♥ on the photo: whether it's saved, and whether the viewer can save (else it links to log in). */
  save?: { initial: boolean; signedInCustomer: boolean };
  /** Row only: a full-width "Request service" button under the card (AI search results). */
  requestHref?: string;
}) {
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const avail = availabilityLabel(p.availability, t);
  const verified = p.badges.some((b) => b.kind === "VERIFIED");
  const distance = p.distance
    ? p.distance.from === "you" || !originArea
      ? fill(t.location.away, { distance: formatDistance(p.distance.km, p.distance.precision) })
      : fill(t.location.fromArea, { distance: formatDistance(p.distance.km, p.distance.precision), area: originArea })
    : null;
  const areaText = p.area ? p.area.name : null;
  const service = p.service ?? p.category;
  const priceText = p.price ? formatPrice(p.price, t.profile.priceLabels) : null;
  const askForPrice = !!p.price && priceText === t.profile.priceLabels.askForPrice;
  // "From" comes from the provider's own price type, never added to a fixed price.
  const fromWord = p.price?.priceType === "FROM" ? t.ui.profile.fromPrice : null;
  const priceValue =
    p.price?.priceType === "FROM" && p.price.priceMin != null ? `${formatTzs(p.price.priceMin)}${p.price.priceUnit ? ` ${p.price.priceUnit}` : ""}` : priceText;
  const actions = [...p.actions].sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)).slice(0, 2);

  // The whole card is clickable through this link's overlay.
  const title = (
    <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
      {p.name}
    </Link>
  );
  const star = <Star aria-hidden className="size-3.5 fill-accent-400 text-accent-500" />;
  const rating = p.rating.count && p.rating.avg != null ? (
    <span className="inline-flex items-center gap-1">
      {star}
      <b className="text-ink">{p.rating.avg.toFixed(1)}</b>
      <span className="text-ink-subtle">({p.rating.count})</span>
    </span>
  ) : (
    <span className="text-ink-subtle">{t.trust.rating.noReviews}</span>
  );
  const availPill = avail && <span className={`inline-flex min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[avail.tone]}`}>{avail.text}</span>;

  if (variant === "list") {
    return (
      <article className="group relative flex gap-3 rounded-2xl border border-line bg-surface p-2.5 shadow-soft transition duration-200 hover:shadow-lift has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-500">
        <Photo p={p} sizes="128px" className="h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-32" />
        <div className="flex min-w-0 flex-1 flex-col py-0.5">
          <h3 className="flex min-w-0 items-center gap-1 text-[13px] font-bold tracking-tight sm:text-[15px]">
            <span className="truncate">{title}</span>
            {verified && <BadgeCheck aria-label={t.ui.home.verified} className="size-4 shrink-0 fill-link text-white" />}
            {p.demo && <SampleTag t={t} />}
          </h3>
          <div className="mt-1 text-xs">{rating}</div>
          {distance && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{distance}</span>
            </p>
          )}
          {avail && (
            <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${avail.tone === "open" ? "text-success" : "text-ink-muted"}`}>
              <span className={`size-1.5 rounded-full ${avail.tone === "open" ? "bg-success" : "bg-ink-subtle"}`} />
              {avail.text}
            </p>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
            <span className="truncate text-[11px] text-ink-subtle">{service ? name(service) : ""}</span>
            <span aria-hidden className="shrink-0 rounded-full border border-link/40 px-3 py-1 text-[11px] font-semibold text-link">
              {t.ui.home.viewProfile}
            </span>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "row") {
    return (
      <article className="group relative flex flex-col rounded-2xl border border-line bg-surface p-2.5 shadow-soft transition duration-200 hover:shadow-lift has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-500 sm:p-3">
      <div className="flex gap-3 sm:gap-4">
        <div className="relative shrink-0">
          <Photo p={p} sizes="128px" className="h-24 w-24 rounded-xl sm:h-28 sm:w-32" />
          {verified && <VerifiedPill t={t} className="absolute bottom-1.5 left-1.5 origin-bottom-left scale-90" light />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="flex min-w-0 items-center gap-1.5 text-[15px] font-bold tracking-tight">
            <span className="truncate">{title}</span>
            {p.demo && <SampleTag t={t} />}
          </h3>
          <div className="mt-1 text-xs">{rating}</div>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-ink-muted">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{[areaText, distance].filter(Boolean).join(" · ") || (service ? name(service) : "")}</span>
          </p>
          <div className="relative z-10 mt-1.5">
            <CompareToggle slug={p.slug} name={p.name} />
          </div>
          <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
            {availPill ?? <span />}
            {priceText && (
              <span className="shrink-0 text-right leading-tight whitespace-nowrap">
                {!askForPrice && fromWord && <span className="block text-[10px] text-ink-subtle">{fromWord}</span>}
                <span className={`text-[13px] ${askForPrice ? "font-medium text-ink-muted" : "font-bold text-ink"}`}>{priceValue}</span>
              </span>
            )}
          </div>
        </div>
        {actions.length > 0 && (
          <div className="relative z-10 flex shrink-0 flex-col gap-2">
            {actions.map(({ action, href }) => (
              <ConnectButton key={action} slug={p.slug} action={action} href={href} label={t.profile.actions[action]} source="CARD" iconOnly demo={p.demo} />
            ))}
          </div>
        )}
      </div>
      {requestHref && (
        <Link href={requestHref} className="relative z-10 mt-3 flex min-h-11 items-center justify-center rounded-xl bg-action text-sm font-semibold text-white transition hover:bg-action-hover active:scale-[0.99]">
          {t.ui.profile.requestService}
        </Link>
      )}
      </article>
    );
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-500">
      <div className="relative">
        <Photo p={p} sizes="(max-width: 640px) 60vw, 320px" className="aspect-[3/2]" />
        {verified && <VerifiedPill t={t} className="absolute top-2 left-2" />}
        {save && (
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton providerId={p.id} slug={p.slug} initial={save.initial} signedInCustomer={save.signedInCustomer} round small />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold tracking-tight">
          <span className="truncate">{title}</span>
          {p.demo && <SampleTag t={t} />}
        </h3>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
          {rating}
          {distance && <span className="truncate text-ink-muted">{distance}</span>}
        </div>
        {priceText && (
          <p className="mt-2 text-xs text-ink-muted">
            {!askForPrice && fromWord && `${fromWord} `}
            <span className={askForPrice ? "" : "font-bold text-ink"}>{priceValue}</span>
          </p>
        )}
        {availPill && <div className="mt-2">{availPill}</div>}
      </div>
    </article>
  );
}
