import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Phone, Star } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { customerRequest } from "@/lib/services/requests";
import { formatTzs } from "@/lib/provider/format";
import { formatPhone } from "@/lib/phone";
import { RequestDetails, requestTitle, StatusBadge } from "@/components/requests/RequestSummary";
import { AcceptButton, Conversation, CustomerControls, MarkSeen } from "@/components/requests/RequestActions";
import { RatingSummary } from "@/components/trust/TrustBadges";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { ReportButton } from "@/components/admin/platform/ReportButton";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.requests.list.title };
}

export default async function CustomerRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("requests:create", `/requests/${id}`);
  const { t, locale } = await getServerDictionary();
  // Only the request's own customer gets anything back; everyone else sees 404.
  const r = await customerRequest(user.id, id);
  if (!r) notFound();
  const sp = await searchParams;
  const d = t.requests.detail;
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Dar_es_Salaam" });
  const shortDate = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "UTC" });

  // Providers who haven't answered stay out of the list (except on a direct request); decliners always do.
  const direct = !!r.targetProviderId;
  const shown = r.matches.filter((m) => m.status !== "DECLINED" && (m.status !== "NOTIFIED" || direct));
  const waiting = r.matches.filter((m) => m.status === "NOTIFIED").length;
  const open = r.effective === "OPEN";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <MarkSeen requestId={r.id} />
      <Link href="/requests" className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {d.backToList}
      </Link>
      {sp.photo === "failed" && <Alert tone="info">{t.requests.new.photoFailed}</Alert>}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">{requestTitle(r, locale, t)}</h1>
          <StatusBadge status={r.effective} t={t} />
        </div>
        <p className="mb-3 text-xs text-ink-subtle">
          {fill(d.posted, { date: date.format(r.createdAt) })}
          {open && ` · ${fill(d.expires, { date: date.format(r.expiresAt) })}`}
          {` · ${d.contactPref}: ${t.requests.new[`contact${r.contactPreference}`]}`}
        </p>
        <RequestDetails r={r} t={t} locale={locale} address={r.addressText} />
        <div className="mt-4">
          <CustomerControls requestId={r.id} canCancel={r.status === "OPEN" || r.status === "ACCEPTED"} canComplete={r.status === "ACCEPTED"} />
        </div>
      </Card>

      <section aria-labelledby="providers" className="flex flex-col gap-3">
        <h2 id="providers" className="font-semibold">
          {d.responsesTitle}
        </h2>
        {r.matches.length === 0 && <Card className="text-sm text-ink-muted">{d.noMatches}</Card>}
        {r.matches.length > 0 && shown.length === 0 && <Card className="text-sm text-ink-muted">{d.waiting}</Card>}
        {shown.map((m) => {
          const name = m.provider.profile?.displayName ?? "—";
          const chosen = r.acceptedProviderId === m.provider.id;
          const convoOpen = r.status !== "CANCELLED" && m.status !== "NOT_SELECTED";
          return (
            <Card key={m.id} className={chosen ? "border-brand-500" : ""}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/p/${m.provider.slug}`} className="font-semibold hover:underline">
                    {name}
                  </Link>
                  <p className="text-xs text-ink-subtle">
                    {t.requests.matchStatus[m.status]}
                    {m.provider.ratingCount > 0 && (
                      <>
                        {" · "}
                        <RatingSummary avg={m.provider.ratingAvg} count={m.provider.ratingCount} t={t} />
                      </>
                    )}
                    {m.provider.verificationLevel && ` · ${locale === "sw" ? m.provider.verificationLevel.nameSw : m.provider.verificationLevel.nameEn}`}
                  </p>
                </div>
                {m.unread > 0 && (
                  <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{fill(d.newMessages, { count: m.unread })}</span>
                )}
              </div>

              {m.quote && m.quote.status !== "WITHDRAWN" && (
                <div className="mt-3 rounded-xl bg-canvas p-3 text-sm">
                  <p className="text-xs text-ink-subtle">{d.quote}</p>
                  <p className="text-lg font-bold">{formatTzs(m.quote.amount)}</p>
                  {m.quote.validUntil && <p className="text-xs text-ink-subtle">{fill(d.quoteValid, { date: shortDate.format(m.quote.validUntil) })}</p>}
                  {m.quote.note && <p className="mt-1 whitespace-pre-line text-ink-muted">{m.quote.note}</p>}
                </div>
              )}

              {chosen && (m.provider.profile?.phone || m.provider.profile?.whatsapp) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.provider.profile?.phone && (
                    <ButtonLink href={`tel:+${m.provider.profile.phone}`} variant="secondary" className="min-h-10">
                      <Phone aria-hidden className="size-4" />
                      {d.call} {formatPhone(m.provider.profile.phone)}
                    </ButtonLink>
                  )}
                  {m.provider.profile?.whatsapp && (
                    <ButtonLink href={`https://wa.me/${m.provider.profile.whatsapp}`} target="_blank" rel="noopener noreferrer" variant="secondary" className="min-h-10">
                      <MessageCircle aria-hidden className="size-4" />
                      {d.whatsapp}
                    </ButtonLink>
                  )}
                </div>
              )}

              {open && (m.status === "INTERESTED" || m.status === "QUOTED") && (
                <div className="mt-3">
                  <AcceptButton requestId={r.id} providerId={m.provider.id} providerName={name} />
                </div>
              )}

              {chosen && r.status === "COMPLETED" && (
                <ButtonLink href={`/p/${m.provider.slug}#reviews`} variant="accent" className="mt-3 min-h-10">
                  <Star aria-hidden className="size-4" />
                  {d.leaveReview}
                </ButtonLink>
              )}

              <details className="mt-3" open={m.unread > 0 || chosen}>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">{fill(d.showMessages, { count: m.messages.length })}</summary>
                <div className="mt-2">
                  <Conversation matchId={m.id} messages={m.messages} me="CUSTOMER" otherName={name} open={convoOpen} />
                  {m.messages.length > 0 && <ReportButton targetType="CONVERSATION" targetId={m.id} />}
                </div>
              </details>
            </Card>
          );
        })}
        {shown.length > 0 && waiting > 0 && open && !direct && <p className="text-xs text-ink-subtle">{d.waiting}</p>}
      </section>
    </div>
  );
}
