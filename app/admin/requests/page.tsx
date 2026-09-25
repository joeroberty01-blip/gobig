import Link from "next/link";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { listRequestsAdmin } from "@/lib/services/admin/oversight";
import { requestTitle, StatusBadge } from "@/components/requests/RequestSummary";
import { oneOf, pageParam, Pager, qs } from "@/components/admin/platform/Bits";
import { ReasonAction } from "@/components/admin/platform/Controls";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.requests.title };
}

const STATUSES = ["OPEN", "ACCEPTED", "COMPLETED", "CANCELLED"] as const;

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("requests:oversee", "/admin/requests");
  const { t, locale } = await getServerDictionary();
  const r = t.adminPlatform.requests;
  const sp = await searchParams;
  const status = oneOf(sp.status, STATUSES);
  const page = pageParam(sp.page);
  const { rows, pages, total } = await listRequestsAdmin({ status, page });
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={r.title} subtitle={r.intro} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {[null, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={`/admin/requests${qs({ status: s })}`}
            aria-current={s === status ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 font-semibold ${s === status ? "bg-brand-700 text-white" : "bg-surface text-ink-muted ring-1 ring-line"}`}
          >
            {s ? t.requests.status[s] : t.adminPlatform.common.all}
          </Link>
        ))}
        <span className="self-center text-ink-subtle">{fill(t.adminPlatform.common.total, { count: total })}</span>
      </nav>
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.adminPlatform.common.none}</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((q) => (
            <li key={q.id}>
              <Card className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{requestTitle(q, locale, t)}</span>
                  <StatusBadge status={q.effective} t={t} />
                  <span className="text-xs text-ink-subtle">
                    {q.location.name} · {date.format(q.createdAt)}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-ink-muted">{q.description}</p>
                <p className="text-xs text-ink-subtle">
                  {r.customer}:{" "}
                  <Link href={`/admin/users/${q.customer.id}`} className="underline">
                    {q.customer.name}
                  </Link>{" "}
                  · {fill(r.counts, { matches: q._count.matches, quotes: q._count.quotes })}
                  {q.acceptedProvider && (
                    <>
                      {" "}
                      · {r.chosen}:{" "}
                      <Link href={`/p/${q.acceptedProvider.slug}`} className="underline">
                        {q.acceptedProvider.profile?.displayName ?? q.acceptedProvider.slug}
                      </Link>
                    </>
                  )}
                </p>
                {(q.status === "OPEN" || q.status === "ACCEPTED") && (
                  <div>
                    <ReasonAction action={{ kind: "cancelRequest", id: q.id }} label={r.cancel} hint={r.cancelHint} danger />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={pages} t={t} href={(n) => `/admin/requests${qs({ status, page: n })}`} />
    </div>
  );
}
