import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, GitCompareArrows, MapPin } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { parseCompareSlugs } from "@/lib/compare";
import { compareProviders } from "@/lib/services/compare";
import { formatPrice } from "@/lib/provider/format";
import { availabilityLabel } from "@/components/discovery/ProviderCard";
import { CompareRemove } from "@/components/discovery/Compare";
import { ConnectButton } from "@/components/connect/ConnectButton";
import { RatingSummary, TrustBadges } from "@/components/trust/TrustBadges";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  // Shared comparisons aren't pages for search engines.
  return { title: t.ui.compare.title, robots: { index: false } };
}

const TONE = { open: "bg-success-soft text-success", closed: "bg-canvas text-ink-muted", neutral: "bg-brand-50 text-brand-900" };

// Compare (Phase 15): up to three live providers side by side, only their own public data, in the
// order the customer picked. No ranking, no "best", no paid placement.
export default async function ComparePage({ searchParams }: Props) {
  const slugs = parseCompareSlugs((await searchParams).p);
  const [{ t, locale }, items] = await Promise.all([getServerDictionary(), compareProviders(slugs)]);
  const c = t.ui.compare;
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const shown = items.map((i) => i.card.slug);

  if (items.length < 2) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={c.title} />
        <EmptyState
          icon={<GitCompareArrows aria-hidden />}
          title={c.needTwo}
          body={c.howTo}
          action={
            <ButtonLink href="/search" variant="night">
              {t.ui.nav.explore}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const rows: { label: string; cell: (i: (typeof items)[number]) => React.ReactNode }[] = [
    { label: c.rating, cell: (i) => <RatingSummary avg={i.card.rating.avg} count={i.card.rating.count} t={t} /> },
    {
      label: c.verified,
      cell: (i) =>
        i.card.badges.some((b) => b.kind === "VERIFIED") ? (
          <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
            <BadgeCheck aria-hidden className="size-4" />
            {t.ui.home.verified}
          </span>
        ) : (
          <span className="text-ink-subtle">{c.notVerified}</span>
        ),
    },
    {
      label: c.availability,
      cell: (i) => {
        const a = availabilityLabel(i.card.availability, t);
        return a ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[a.tone]}`}>{a.text}</span> : <span className="text-ink-subtle">—</span>;
      },
    },
    {
      label: c.services,
      cell: (i) => (
        <ul className="flex flex-col gap-1.5">
          {i.services.map((s, k) => (
            <li key={k} className="flex flex-col">
              <span className="font-medium">{name(s)}</span>
              <span className={s.priceType === "ON_QUOTE" ? "text-xs text-ink-subtle" : "text-xs font-semibold"}>{formatPrice(s, t.profile.priceLabels)}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: c.area,
      cell: (i) =>
        i.card.area ? (
          <span className="inline-flex items-start gap-1">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
            {[i.card.area.name, i.card.area.district].filter(Boolean).join(", ")}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      label: c.serviceAreas,
      cell: (i) => (i.serviceAreas.length ? i.serviceAreas.join(", ") : <span className="text-ink-subtle">{c.customersComeToThem}</span>),
    },
    {
      label: c.trust,
      cell: (i) => {
        const extra = i.card.badges.filter((b) => b.kind === "TOP_RATED" || b.kind === "FAST_RESPONSE");
        return extra.length ? <TrustBadges badges={extra} t={t} locale={locale} size="sm" /> : <span className="text-ink-subtle">—</span>;
      },
    },
    {
      label: c.contact,
      cell: (i) => (
        <div className="flex flex-col gap-2">
          {i.card.actions.slice(0, 3).map(({ action, href }) => (
            <ConnectButton key={action} slug={i.card.slug} action={action} href={href} label={t.profile.actions[action]} source="CARD" primary={action === "CALL"} className="min-h-10" />
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={c.title} subtitle={c.orderNote} />
      <div className="-mx-4 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
        <div className={`grid ${items.length === 2 ? "grid-cols-[6.5rem_repeat(2,minmax(12rem,1fr))] sm:grid-cols-[9rem_repeat(2,minmax(12rem,1fr))]" : "grid-cols-[6.5rem_repeat(3,minmax(12rem,1fr))] sm:grid-cols-[9rem_repeat(3,minmax(12rem,1fr))]"} min-w-max overflow-hidden rounded-2xl border border-line bg-surface shadow-soft sm:min-w-0`}>
          {/* Header row */}
          <div className="sticky left-0 z-10 border-b border-line bg-surface" />
          {items.map((i) => (
            <div key={i.card.id} className="flex flex-col gap-2 border-b border-l border-line p-3">
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-hero">
                {i.card.coverUrl || i.card.logoUrl ? (
                  <Image src={(i.card.coverUrl ?? i.card.logoUrl)!} alt="" fill sizes="240px" className="object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-3xl font-black text-white/90">{i.card.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <Link href={`/p/${i.card.slug}`} className="line-clamp-2 font-bold tracking-tight hover:underline">
                {i.card.name}
              </Link>
              {(i.card.service ?? i.card.category) && <p className="text-xs text-ink-muted">{name((i.card.service ?? i.card.category)!)}</p>}
              <CompareRemove slug={i.card.slug} slugs={shown} />
            </div>
          ))}
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <div className="sticky left-0 z-10 border-b border-line bg-canvas px-3 py-3 text-xs font-semibold text-ink-muted">{row.label}</div>
              {items.map((i) => (
                <div key={i.card.id} className="border-b border-l border-line px-3 py-3 text-sm">
                  {row.cell(i)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {slugs.length > items.length && <p className="mt-3 text-xs text-ink-subtle">{fill(c.someUnavailable, { count: slugs.length - items.length })}</p>}
    </div>
  );
}
