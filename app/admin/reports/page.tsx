import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listReports } from "@/lib/services/admin/oversight";
import { oneOf, qs } from "@/components/admin/platform/Bits";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.reports.title };
}

const TABS = ["OPEN", "RESOLVED", "DISMISSED"] as const;

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("reports:manage", "/admin/reports");
  const { t, locale } = await getServerDictionary();
  const r = t.adminPlatform.reports;
  const status = oneOf((await searchParams).status, TABS) ?? "OPEN";
  const [rows, reviewReports] = await Promise.all([listReports(status), prisma.review.count({ where: { reports: { some: { status: "OPEN" } } } })]);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={r.title} subtitle={r.intro} />
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {TABS.map((s) => (
          <Link
            key={s}
            href={`/admin/reports${qs({ status: s === "OPEN" ? null : s })}`}
            aria-current={s === status ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 font-semibold ${s === status ? "bg-brand-700 text-white" : "bg-surface text-ink-muted ring-1 ring-line"}`}
          >
            {r.tabs[s]}
          </Link>
        ))}
        <Link href="/admin/reviews" className="ml-auto font-semibold text-brand-700 underline">
          {fill(r.reviewsLink, { count: reviewReports })}
        </Link>
      </nav>
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.adminPlatform.common.none}</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((x) => (
            <li key={x.id}>
              <Link href={`/admin/reports/${x.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand-500">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold">{r.targets[x.targetType]}</span>
                    <span className="font-semibold">{r.reasons[x.reason]}</span>
                    {x.provider && <span className="text-sm text-ink-muted">· {x.provider.profile?.displayName ?? x.provider.slug}</span>}
                    {x.openForTarget > 1 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{fill(r.repeat, { count: x.openForTarget })}</span>}
                  </span>
                  {x.note && <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">{x.note}</span>}
                  <span className="block text-xs text-ink-subtle">
                    {fill(r.reportedBy, { name: x.reporter.name })} · {date.format(x.createdAt)}
                    {x.resolution && ` · ${x.resolution}`}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
