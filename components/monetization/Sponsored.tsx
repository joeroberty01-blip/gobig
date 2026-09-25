import { Megaphone } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import type { ProviderCard as Card } from "@/lib/services/discovery";
import { ProviderCard } from "@/components/discovery/ProviderCard";
import { CardGrid } from "@/components/discovery/Section";

/**
 * Paid placement (Phase 11). Always its own clearly labelled block, never mixed into the ranked
 * list: the same providers still appear at their organic positions below, and paying changes
 * nothing about their badges, ratings or rank.
 */
export function SponsoredResults({ cards, t, locale }: { cards: Card[]; t: Dictionary; locale: Locale }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby="sponsored" className="mb-5 rounded-2xl border border-dashed border-accent-500 bg-accent-400/10 p-3">
      <h2 id="sponsored" className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-400 px-2 py-0.5 text-xs font-bold text-brand-900">
          <Megaphone aria-hidden className="size-3.5" />
          {t.billing.sponsored.label}
        </span>
        <span className="font-normal text-ink-muted">{t.billing.sponsored.explain}</span>
      </h2>
      <CardGrid>
        {cards.map((p) => (
          <ProviderCard key={p.id} p={p} t={t} locale={locale} />
        ))}
      </CardGrid>
    </section>
  );
}
