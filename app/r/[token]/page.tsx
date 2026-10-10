import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, MapPin, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { verifyReplyToken } from "@/lib/requests/replyLink";
import { providerRequest } from "@/lib/services/requests";
import { replyLinkText } from "@/lib/i18n/replyLink";
import { Wordmark } from "@/components/layout/Logo";
import { ReplyLinkForm } from "@/components/requests/ReplyLinkForm";
import { budgetText, whenText } from "@/components/requests/RequestSummary";
import { getDictionary, isLocale } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = { title: { absolute: "Go Big" }, robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };

/**
 * One-tap reply page for a business that got a new request by SMS (product plan, 2026-10-10). No
 * sign-in: the signed link names the conversation and the member (SEC-067). It shows what a matched
 * business may see in the app — never the customer's contact or exact address before they choose.
 */
export default async function ReplyLinkPage({ params }: Props) {
  const { token } = await params;
  const claim = verifyReplyToken(token);
  const member = claim
    ? await prisma.user.findUnique({ where: { id: claim.userId }, select: { locale: true, status: true, deletedAt: true } })
    : null;
  const match = claim
    ? await prisma.requestMatch.findUnique({ where: { id: claim.matchId }, select: { requestId: true, providerId: true, provider: { select: { members: { where: { userId: claim.userId }, select: { id: true } } } } } })
    : null;
  const locale = isLocale(member?.locale) ? member.locale : "sw";
  const t = getDictionary(locale);
  const r = replyLinkText(locale);
  const valid = claim && member && member.status === "ACTIVE" && !member.deletedAt && match && match.provider.members.length > 0;
  const view = valid ? await providerRequest(match.providerId, match.requestId) : null;
  const name = (x: { nameEn: string; nameSw: string } | null | undefined) => (x ? (locale === "sw" ? x.nameSw : x.nameEn) : "");

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-canvas px-4 py-6">
      <Wordmark className="text-2xl text-ink" />
      {!view ? (
        <p className="mt-6 rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">{r.invalid}</p>
      ) : (
        <>
          <h1 className="mt-5 text-xl font-bold">
            {r.title}: {name(view.request.service) || name(view.request.category)}
          </h1>
          <dl className="mt-3 space-y-2 rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">
            <div className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-action" />
              <dt className="sr-only">{r.where}</dt>
              <dd>{[view.request.location?.name, view.request.location?.parent?.name].filter(Boolean).join(", ")}</dd>
            </div>
            <div className="flex items-start gap-2">
              <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-action" />
              <dt className="sr-only">{r.when}</dt>
              <dd>{whenText(view.request, locale, t)}</dd>
            </div>
            {(view.request.budgetMin != null || view.request.budgetMax != null) && (
              <div className="flex items-start gap-2">
                <Wallet aria-hidden className="mt-0.5 size-4 shrink-0 text-action" />
                <dt className="sr-only">{r.budget}</dt>
                <dd>{budgetText(view.request, t)}</dd>
              </div>
            )}
            <p className="border-t border-line pt-2 whitespace-pre-line text-ink">{view.request.description}</p>
          </dl>
          <p className="mt-2 text-xs text-ink-subtle">{r.privacy}</p>
          <div className="mt-5">{view.request.effective === "OPEN" && ["NOTIFIED", "INTERESTED", "QUOTED"].includes(view.matchStatus) ? <ReplyLinkForm token={token} text={r} /> : <p className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">{r.closed}</p>}</div>
        </>
      )}
      <Link href={view ? `/provider/requests/${view.request.id}` : "/provider/requests"} className="mt-6 block text-center text-sm font-semibold text-action underline">
        {r.openApp}
      </Link>
    </main>
  );
}
