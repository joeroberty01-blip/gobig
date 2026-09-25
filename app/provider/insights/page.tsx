import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Lightbulb, Minus } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import type { ConnectAction } from "@/lib/provider/connect";
import { PERIODS, providerAnalytics, type Analytics, type Period } from "@/lib/services/metrics";
import { DailyBars } from "@/components/insights/DailyBars";
import { BarList } from "@/components/insights/BarList";
import { Alert, ButtonLink, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.insights.title };
}

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);

function Delta({ now, before, days, t }: { now: number; before: number; days: number; t: Dictionary }) {
  if (before === 0) return <p className="mt-1 text-xs text-ink-subtle">{fill(t.insights.noPrevious, { days })}</p>;
  const change = (now - before) / before;
  const Icon = change > 0.005 ? ArrowUpRight : change < -0.005 ? ArrowDownRight : Minus;
  // Direction carried by an icon and a signed number, not by colour alone.
  const tone = change > 0.005 ? "text-success" : change < -0.005 ? "text-danger" : "text-ink-subtle";
  return (
    <p className={`mt-1 flex items-center gap-1 text-xs ${tone}`}>
      <Icon aria-hidden className="size-3.5" />
      {fill(t.insights.vsPrevious, { change: `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`, days })}
    </p>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      {children}
    </div>
  );
}

function tips(a: Analytics, t: Dictionary): string[] {
  const out: string[] = [];
  if (a.appearances.count >= 20 && (a.conversion.viewRate ?? 1) < 0.05) out.push(t.insights.tip.lowViewRate);
  if (a.views.count >= 20 && (a.conversion.contactRate ?? 1) < 0.05) out.push(t.insights.tip.lowContactRate);
  if (a.requests.median != null && a.requests.median > 60) out.push(t.insights.tip.slowReplies);
  return out;
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageAccess("analytics:view-own", "/provider/insights");
  const { t, locale } = await getServerDictionary();
  const i = t.insights;
  const providerId = await getOwnedProviderId(user.id);
  if (!providerId) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={i.title} />
        <Card className="flex flex-col items-start gap-3 text-sm text-ink-muted">
          {i.noBusiness}
          <ButtonLink href="/provider/setup/name">{t.profile.dashboard.start}</ButtonLink>
        </Card>
      </div>
    );
  }

  const raw = Number((await searchParams).days);
  const days: Period = (PERIODS as readonly number[]).includes(raw) ? (raw as Period) : 30;
  const [a, provider] = await Promise.all([
    providerAnalytics(providerId, days),
    prisma.provider.findUnique({ where: { id: providerId }, select: { status: true } }),
  ]);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const dayKeys = a.series.map((d) => d.day.toISOString());
  const dayFmt = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const duration = (m: number | null) => (m == null ? i.requests.none : m < 90 ? fill(i.requests.minutes, { n: m }) : fill(i.requests.hours, { n: Math.round(m / 60) }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title={i.title} subtitle={i.intro} />

      {/* Filters in one row above everything they scope. */}
      <nav aria-label={i.title} className="-mt-3 flex w-fit rounded-xl bg-canvas p-1 ring-1 ring-line">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/provider/insights?days=${p}`}
            aria-current={p === days ? "page" : undefined}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-semibold ${p === days ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            {i.periods[p]}
          </Link>
        ))}
      </nav>

      {provider?.status !== "ACTIVE" && <Alert tone="info">{i.notLive}</Alert>}

      <section aria-labelledby="funnel">
        <h2 id="funnel" className="mb-2 font-semibold">
          {i.funnel.title}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label={i.funnel.appearances} value={a.appearances.count.toLocaleString("en-US")}>
            <Delta now={a.appearances.count} before={a.appearances.previous} days={days} t={t} />
          </Tile>
          <Tile label={i.funnel.views} value={a.views.count.toLocaleString("en-US")}>
            <Delta now={a.views.count} before={a.views.previous} days={days} t={t} />
            {a.conversion.viewRate != null && <p className="mt-1 text-xs text-ink-muted">{fill(i.funnel.viewRate, { rate: pct(a.conversion.viewRate) })}</p>}
          </Tile>
          <Tile label={i.funnel.taps} value={a.taps.count.toLocaleString("en-US")}>
            <Delta now={a.taps.count} before={a.taps.previous} days={days} t={t} />
            {a.conversion.contactRate != null && <p className="mt-1 text-xs text-ink-muted">{fill(i.funnel.contactRate, { rate: pct(a.conversion.contactRate) })}</p>}
          </Tile>
        </div>
      </section>

      {tips(a, t).map((tip) => (
        <div key={tip} className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
          {tip}
        </div>
      ))}

      <Card>
        <h2 className="mb-1 font-semibold">{i.trend.title}</h2>
        <p className="mb-4 text-xs text-ink-subtle">{i.trend.hint}</p>
        <div className="flex flex-col gap-6">
          <DailyBars title={i.trend.appearances} days={dayKeys} values={a.series.map((d) => d.appearances)} locale={locale} />
          <DailyBars title={i.trend.views} days={dayKeys} values={a.series.map((d) => d.views)} locale={locale} />
          <DailyBars title={i.trend.taps} days={dayKeys} values={a.series.map((d) => d.taps)} locale={locale} />
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-brand-700">{i.trend.table}</summary>
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="w-full text-right tabular-nums">
              <thead className="sticky top-0 bg-surface text-xs text-ink-subtle">
                <tr>
                  <th className="py-1 text-left font-normal">{i.trend.date}</th>
                  <th className="py-1 font-normal">{i.trend.appearances}</th>
                  <th className="py-1 font-normal">{i.trend.views}</th>
                  <th className="py-1 font-normal">{i.trend.taps}</th>
                </tr>
              </thead>
              <tbody>
                {[...a.series].reverse().map((d) => (
                  <tr key={d.day.toISOString()} className="border-t border-line">
                    <td className="py-1 text-left text-ink-muted">{dayFmt.format(d.day)}</td>
                    <td className="py-1">{d.appearances}</td>
                    <td className="py-1">{d.views}</td>
                    <td className="py-1">{d.taps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{i.sources.title}</h2>
          <h3 className="mb-2 text-xs font-medium text-ink-subtle uppercase">{i.sources.views}</h3>
          <BarList rows={a.views.bySource.map((s) => ({ label: i.sources[s.source], value: s.count }))} empty={i.sources.empty} />
          <h3 className="mt-5 mb-2 text-xs font-medium text-ink-subtle uppercase">{i.sources.appearances}</h3>
          <BarList rows={a.appearances.bySource.map((s) => ({ label: i.sources[s.source], value: s.count }))} empty={i.sources.empty} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{i.searched.title}</h2>
          <h3 className="mb-2 text-xs font-medium text-ink-subtle uppercase">{i.searched.services}</h3>
          <BarList rows={a.topServices.map((s) => ({ label: name(s.service!), value: s.count }))} empty={i.searched.empty} />
          <h3 className="mt-5 mb-2 text-xs font-medium text-ink-subtle uppercase">{i.searched.areas}</h3>
          <BarList rows={a.topAreas.map((s) => ({ label: s.name!, value: s.count }))} empty={i.searched.empty} />
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">{i.contacts.title}</h2>
        <BarList
          rows={Object.entries(a.taps.byAction).map(([action, value]) => ({ label: t.profile.actions[action as ConnectAction], value }))}
          empty={i.contacts.empty}
        />
      </Card>

      <section aria-labelledby="requests">
        <h2 id="requests" className="mb-2 font-semibold">
          {i.requests.title}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={i.requests.received} value={String(a.requests.received)}>
            <Delta now={a.requests.received} before={a.requests.previous} days={days} t={t} />
          </Tile>
          <Tile label={i.requests.responseRate} value={pct(a.conversion.responseRate)} />
          <Tile label={i.requests.medianTime} value={duration(a.requests.median)} />
          <Tile label={i.requests.won} value={String(a.requests.won)}>
            {a.conversion.winRate != null && <p className="mt-1 text-xs text-ink-muted">{pct(a.conversion.winRate)}</p>}
          </Tile>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          {i.requests.responded}: {a.requests.responded} · {i.requests.quoted}: {a.requests.quoted} · {i.requests.completed}: {a.requests.completed}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={i.reviews.new} value={String(a.reviews.count)} />
        <Tile label={i.reviews.avg} value={a.reviews.avg == null ? "—" : `${a.reviews.avg.toFixed(1)} ★`} />
        <Tile label={i.favorites.total} value={String(a.favorites.total)} />
        <Tile label={i.favorites.added} value={String(a.favorites.added)} />
      </div>
    </div>
  );
}
