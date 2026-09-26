import { BadgeCheck, Clock, Star, Trophy, Zap } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/dictionaries";
import type { TrustBadge } from "@/lib/provider/trust";

const STYLE: Record<TrustBadge["kind"], string> = {
  VERIFIED: "bg-brand-50 text-brand-900 ring-brand-100",
  TOP_RATED: "bg-warning-soft text-warning ring-accent-400/40",
  AVAILABLE: "bg-success-soft text-success ring-success/25",
  FAST_RESPONSE: "bg-canvas text-ink ring-line",
};
const ICON = { VERIFIED: BadgeCheck, TOP_RATED: Trophy, AVAILABLE: Clock, FAST_RESPONSE: Zap };

/** Each badge is a distinct, earned signal (lib/provider/trust.ts). None of them can be bought. */
export function TrustBadges({ badges, t, locale, size = "md" }: { badges: TrustBadge[]; t: Dictionary; locale: Locale; size?: "sm" | "md" }) {
  if (!badges.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {badges.map((b) => {
        const Icon = ICON[b.kind];
        const title = b.kind === "VERIFIED" ? fill(t.trust.badges.verifiedTitle, { level: locale === "sw" ? b.level.nameSw : b.level.nameEn }) : undefined;
        return (
          <li
            key={b.kind}
            title={title}
            className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ${STYLE[b.kind]} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
          >
            <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} />
            {t.trust.badges[b.kind]}
            {title && <span className="sr-only">: {title}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** "★ 4.6 · 12 reviews", or an honest "No reviews yet". Never an invented rating. */
export function RatingSummary({ avg, count, t, compact = false }: { avg: number | null; count: number; t: Dictionary; compact?: boolean }) {
  if (!count || avg == null) {
    return (
      <span className="inline-flex items-center gap-1 text-ink-subtle">
        <Star aria-hidden className="size-3.5" />
        {t.trust.rating.noReviews}
      </span>
    );
  }
  const countText = count === 1 ? t.trust.rating.reviewsCountOne : fill(t.trust.rating.reviewsCount, { count });
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${fill(t.trust.rating.outOf, { avg: avg.toFixed(1) })}, ${countText}`}>
      <Star aria-hidden className="size-3.5 fill-accent-400 text-accent-500" />
      <span className="font-semibold text-ink">{avg.toFixed(1)}</span>
      <span className="text-ink-subtle">{compact ? `(${count})` : `· ${countText}`}</span>
    </span>
  );
}

export function Stars({ value, className = "size-4" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= value ? "fill-accent-400 text-accent-500" : "text-line"}`} />
      ))}
    </span>
  );
}
