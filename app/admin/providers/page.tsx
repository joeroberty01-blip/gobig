import Link from "next/link";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { searchProvidersAdmin } from "@/lib/services/admin/people";
import { RatingSummary } from "@/components/trust/TrustBadges";
import { oneOf, pageParam, Pager, Pill, qs } from "@/components/admin/platform/Bits";
import { ReasonAction } from "@/components/admin/platform/Controls";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.providers.title };
}

const STATUSES = ["ACTIVE", "DRAFT", "PENDING_REVIEW", "SUSPENDED"] as const;
const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base";

export default async function AdminProvidersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("providers:moderate", "/admin/providers");
  const { t, locale } = await getServerDictionary();
  const p = t.adminPlatform.providers;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const status = oneOf(sp.status, STATUSES);
  const page = pageParam(sp.page);
  const { rows, pages, total } = await searchProvidersAdmin({ q, status, page });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={p.title} subtitle={fill(t.adminPlatform.common.total, { count: total })} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder={p.searchPlaceholder} aria-label={p.searchPlaceholder} maxLength={80} className={`${control} min-w-48 flex-1`} />
        <select name="status" defaultValue={status ?? ""} aria-label={t.adminPlatform.users.status} className={control}>
          <option value="">{t.adminPlatform.common.all}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {p[`status${s}`]}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white">
          {t.adminPlatform.common.search}
        </button>
      </form>
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.adminPlatform.common.none}</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const owner = r.members[0]?.user;
            return (
              <li key={r.id}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/p/${r.slug}`} className="font-semibold hover:underline">
                      {r.profile?.displayName ?? r.slug}
                    </Link>
                    <Pill value={r.status} label={p[`status${r.status}`]} />
                    {r.verificationLevel && <span className="text-xs text-ink-subtle">{locale === "sw" ? r.verificationLevel.nameSw : r.verificationLevel.nameEn}</span>}
                    {r._count.reports > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{fill(p.openReports, { count: r._count.reports })}</span>}
                  </div>
                  <p className="text-sm text-ink-muted">
                    {r.profile?.primaryLocation?.name ?? "—"} · <RatingSummary avg={r.ratingAvg} count={r.ratingCount} t={t} compact />
                    {owner && (
                      <>
                        {" · "}
                        {p.owner}:{" "}
                        <Link href={`/admin/users/${owner.id}`} className="underline">
                          {owner.name}
                        </Link>
                      </>
                    )}
                  </p>
                  <div>
                    {r.status === "SUSPENDED" ? (
                      <ReasonAction action={{ kind: "reinstateProvider", id: r.id }} label={p.reinstate} />
                    ) : (
                      <ReasonAction action={{ kind: "suspendProvider", id: r.id }} label={p.suspend} hint={p.suspendHint} danger />
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pages={pages} t={t} href={(n) => `/admin/providers${qs({ q, status, page: n })}`} />
    </div>
  );
}
