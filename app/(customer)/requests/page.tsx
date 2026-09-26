import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { listCustomerRequests } from "@/lib/services/requests";
import { areaText, requestTitle, StatusBadge, whenText } from "@/components/requests/RequestSummary";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.requests.list.title };
}

export default async function MyRequestsPage() {
  const user = await requirePageAccess("requests:create", "/requests");
  const { t, locale } = await getServerDictionary();
  const rows = await listCustomerRequests(user.id);
  const l = t.requests.list;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={l.title}
        action={
          <ButtonLink href="/requests/new" className="min-h-10">
            <Plus aria-hidden className="size-4" />
            {l.newRequest}
          </ButtonLink>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList aria-hidden />} title={l.empty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="block rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{requestTitle(r, locale, t)}</span>
                      <StatusBadge status={r.effective} t={t} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{r.description}</p>
                    <p className="mt-1.5 text-xs text-ink-subtle">
                      {areaText(r.location)} · {whenText(r, locale, t)} ·{" "}
                      {r._count.matches ? fill(l.sentTo, { count: r._count.matches }) : l.sentToNone}
                      {r._count.quotes > 0 && ` · ${fill(l.quotes, { count: r._count.quotes })}`}
                    </p>
                  </div>
                  <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-ink-subtle" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
