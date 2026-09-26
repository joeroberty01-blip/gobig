import Link from "next/link";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { moderationQueue, recentlyHiddenReviews } from "@/lib/services/reviews";
import { Stars } from "@/components/trust/TrustBadges";
import { ModerationButtons } from "@/components/trust/AdminTrustForms";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trust.admin.reviewsTitle };
}

export default async function AdminReviewsPage() {
  await requirePageAccess("reviews:moderate", "/admin/reviews");
  const { t, locale } = await getServerDictionary();
  const [queue, hidden] = await Promise.all([moderationQueue(), recentlyHiddenReviews()]);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.trust.admin.reviewsTitle} />
      {queue.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.trust.admin.reviewsEmpty}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Stars value={r.rating} />
                  <span className="font-semibold">{r.author.name}</span>
                  <span className="text-ink-subtle">· {date.format(r.createdAt)} ·</span>
                  <Link href={`/p/${r.provider.slug}`} className="font-medium text-brand-700">
                    {r.provider.profile?.displayName ?? r.provider.slug}
                  </Link>
                  {r.status === "HIDDEN" && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{t.trust.reviews.statusHIDDEN}</span>}
                </div>
                <p className="text-sm whitespace-pre-line text-ink-muted">{r.body}</p>
                <div className="rounded-xl bg-canvas p-3 text-sm">
                  <p className="mb-1 font-semibold">{fill(t.trust.admin.reportsCount, { count: r.reports.length })}</p>
                  <ul className="flex flex-col gap-1">
                    {r.reports.map((rep) => (
                      <li key={rep.id}>
                        <span className="font-medium">{t.trust.reviews.reasons[rep.reason]}</span>
                        <span className="text-ink-subtle"> · {fill(t.trust.admin.by, { name: `${rep.reporter.name} (${t.roles[rep.reporter.role]})` })}</span>
                        {rep.note && <span className="block text-ink-muted">{rep.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <ModerationButtons reviewId={r.id} status={r.status} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Hiding closes a review's reports, so hidden reviews are listed here to be restored. */}
      <h2 className="mt-10 mb-1 text-lg font-bold">{t.ui.moderation.hiddenTitle}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t.ui.moderation.hiddenIntro}</p>
      {hidden.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.ui.moderation.noneHidden}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {hidden.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Stars value={r.rating} />
                  <span className="font-semibold">{r.author.name}</span>
                  <span className="text-ink-subtle">· {date.format(r.createdAt)} ·</span>
                  <Link href={`/p/${r.provider.slug}`} className="font-medium text-brand-700">
                    {r.provider.profile?.displayName ?? r.provider.slug}
                  </Link>
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{t.trust.reviews.statusHIDDEN}</span>
                </div>
                <p className="text-sm whitespace-pre-line text-ink-muted">{r.body}</p>
                <ModerationButtons reviewId={r.id} status={r.status} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
