import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { providerInbox } from "@/lib/services/reviews";
import { prisma } from "@/lib/db";
import { RatingSummary, Stars } from "@/components/trust/TrustBadges";
import { ReportButton, ResponseForm } from "@/components/trust/ReviewForms";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trust.reviews.inboxTitle };
}

export default async function ProviderReviewsPage() {
  const user = await requirePageAccess("review:respond", "/provider/reviews");
  const { t, locale } = await getServerDictionary();
  const providerId = await getOwnedProviderId(user.id);
  const [reviews, provider] = providerId
    ? await Promise.all([providerInbox(providerId), prisma.provider.findUnique({ where: { id: providerId }, select: { ratingAvg: true, ratingCount: true } })])
    : [[], null];
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.trust.reviews.inboxTitle} />
      {provider && (
        <p className="-mt-3 mb-4 text-sm">
          <RatingSummary avg={provider.ratingAvg} count={provider.ratingCount} t={t} />
        </p>
      )}
      {reviews.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.trust.reviews.inboxEmpty}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Stars value={r.rating} />
                  <span className="font-semibold">{r.authorName}</span>
                  <span className="text-ink-subtle">· {date.format(r.createdAt)}</span>
                  {r.status === "HIDDEN" && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{t.trust.reviews.statusHIDDEN}</span>}
                </div>
                {/* The customer's words are shown as-is; providers can reply or report, never edit. */}
                <p className="mt-2 text-sm whitespace-pre-line text-ink-muted">{r.body}</p>
                {r.response && (
                  <div className="mt-3 rounded-xl bg-canvas p-3 text-sm whitespace-pre-line text-ink-muted">{r.response.body}</div>
                )}
                {r.status === "PUBLISHED" && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <ResponseForm reviewId={r.id} existing={r.response?.body ?? null} />
                    <ReportButton reviewId={r.id} />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
