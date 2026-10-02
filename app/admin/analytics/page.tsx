import Link from "next/link";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { platformAnalytics } from "@/lib/services/admin/insights";
import { platformRollups } from "@/lib/analytics/rollups";
import { formatTzs } from "@/lib/provider/format";
import { DailyBars } from "@/components/insights/DailyBars";
import { BarList } from "@/components/insights/BarList";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.analytics.title };
}

const PERIODS = [7, 30, 90] as const;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-subtle">{sub}</p>}
    </div>
  );
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("analytics:platform", "/admin/analytics");
  const { t, locale } = await getServerDictionary();
  const a = t.adminPlatform.analytics;
  const raw = Number((await searchParams).days);
  const days = (PERIODS as readonly number[]).includes(raw) ? (raw as (typeof PERIODS)[number]) : 30;
  const [d, weeks, months] = await Promise.all([platformAnalytics(days), platformRollups("WEEK", 8), platformRollups("MONTH", 6)]);
  const n = (x: number) => x.toLocaleString("en-US");
  const dayKeys = d.series.map((x) => x.day.toISOString());

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader title={a.title} />
      <nav className="-mt-3 flex w-fit rounded-xl bg-canvas p-1 ring-1 ring-line">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin/analytics?days=${p}`}
            aria-current={p === days ? "page" : undefined}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-semibold ${p === days ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            {t.insights.periods[p]}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={a.customers} value={n(d.users.customers)} sub={fill(a.newInPeriod, { count: d.users.newCustomers })} />
        <Tile label={a.providers} value={n(d.users.providers)} sub={fill(a.newInPeriod, { count: d.users.newProviders })} />
        <Tile label={a.listingsLive} value={n(d.listings.ACTIVE ?? 0)} />
        <Tile label={a.subscriptions} value={n(d.money.activeSubscriptions)} />
        <Tile label={a.requests} value={n(d.requests.created)} />
        <Tile label={a.accepted} value={n(d.requests.accepted)} />
        <Tile label={a.completed} value={n(d.requests.completed)} />
        <Tile label={a.revenue} value={formatTzs(d.money.revenueTzs)} sub={`${d.money.payments}×`} />
        <Tile label={a.appearances} value={n(d.engagement.appearances)} />
        <Tile label={a.views} value={n(d.engagement.views)} />
        <Tile label={a.taps} value={n(d.engagement.taps)} />
        <Tile label={a.reviews} value={n(d.reviews.count)} sub={d.reviews.avg == null ? undefined : `${d.reviews.avg.toFixed(1)} ★`} />
      </div>
      <Card className="flex flex-col gap-6">
        <DailyBars title={a.dailyRequests} days={dayKeys} values={d.series.map((x) => x.requests)} locale={locale} />
        <DailyBars title={a.dailyUsers} days={dayKeys} values={d.series.map((x) => x.users)} locale={locale} />
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">{a.topCategories}</h2>
        <BarList rows={d.topCategories.map((c) => ({ label: locale === "sw" ? c.nameSw : c.nameEn, value: c.n }))} empty={a.none} />
      </Card>
      <Card>
        <h2 className="font-semibold">{a.summaries.title}</h2>
        <p className="mb-3 text-xs text-ink-subtle">{a.summaries.hint}</p>
        {weeks.length + months.length === 0 ? (
          <p className="text-sm text-ink-muted">{a.summaries.none}</p>
        ) : (
          ([["WEEK", weeks], ["MONTH", months]] as const).map(([kind, rows]) =>
            rows.length === 0 ? null : (
              <div key={kind} className="mb-4 overflow-x-auto">
                <h3 className="mb-1 text-sm font-semibold text-ink-muted">{a.summaries[kind]}</h3>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-subtle">
                      {[a.summaries.period, a.customers, a.providers, a.requests, a.completed, a.reviews, a.views, a.summaries.contacts, a.summaries.trips, a.revenue].map((h) => (
                        <th key={h} scope="col" className="py-1.5 pr-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map(({ periodStart, metrics: m }) => (
                      <tr key={periodStart.toISOString()}>
                        <th scope="row" className="py-1.5 pr-3 text-left font-medium whitespace-nowrap">
                          {new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", kind === "WEEK" ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" }).format(periodStart)}
                        </th>
                        <td className="py-1.5 pr-3">+{n(m.newCustomers)}</td>
                        <td className="py-1.5 pr-3">+{n(m.newProviders)}</td>
                        <td className="py-1.5 pr-3">{n(m.requests)}</td>
                        <td className="py-1.5 pr-3">{n(m.completed)}</td>
                        <td className="py-1.5 pr-3">
                          {n(m.reviews)}
                          {m.avgRating != null && <span className="text-ink-subtle"> · {m.avgRating.toFixed(1)}★</span>}
                        </td>
                        <td className="py-1.5 pr-3">{n(m.views)}</td>
                        <td className="py-1.5 pr-3">{n(m.contacts)}</td>
                        <td className="py-1.5 pr-3">{n(m.trips)}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{formatTzs(m.revenueTzs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          )
        )}
      </Card>
    </div>
  );
}
