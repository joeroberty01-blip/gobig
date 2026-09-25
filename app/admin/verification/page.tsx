import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Settings } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { can } from "@/lib/permissions";
import { reviewQueue } from "@/lib/services/verification";
import { ButtonLink, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trust.admin.verificationTitle };
}

const TABS = ["SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] as const;

export default async function AdminVerificationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageAccess("verification:review", "/admin/verification");
  const { t, locale } = await getServerDictionary();
  const requested = (await searchParams).status;
  const status = TABS.find((s) => s === requested) ?? "SUBMITTED";
  const rows = await reviewQueue(status);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t.trust.admin.verificationTitle}
        action={
          can(user, "verification:configure") ? (
            <ButtonLink href="/admin/verification/levels" variant="secondary" className="min-h-9">
              <Settings aria-hidden className="size-4" />
              {t.trust.admin.levelsTitle}
            </ButtonLink>
          ) : undefined
        }
      />
      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((s) => (
          <Link
            key={s}
            href={`?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium ${s === status ? "bg-brand-700 text-white" : "border border-line bg-surface"}`}
          >
            {t.trust.admin.tabs[s]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.trust.admin.queueEmpty}</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/verification/${r.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand-500">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {r.provider.profile?.displayName ?? r.provider.slug}
                    {r.priority && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-900">{t.billing.admin.priorityReview}</span>}
                  </span>
                  <span className="block text-sm text-ink-muted">
                    {locale === "sw" ? r.level.nameSw : r.level.nameEn} · {fill(t.trust.admin.documentsCount, { count: r._count.documents })}
                  </span>
                  {(r.submittedAt ?? r.reviewedAt) && <span className="block text-xs text-ink-subtle">{date.format((r.reviewedAt ?? r.submittedAt)!)}</span>}
                </span>
                <ChevronRight aria-hidden className="size-5 text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
