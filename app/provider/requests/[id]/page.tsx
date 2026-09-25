import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { providerRequest } from "@/lib/services/requests";
import { formatTzs } from "@/lib/provider/format";
import { formatPhone } from "@/lib/phone";
import { RequestDetails, requestTitle, StatusBadge } from "@/components/requests/RequestSummary";
import { Conversation, MarkSeen, ProviderResponse } from "@/components/requests/RequestActions";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { ReportButton } from "@/components/admin/platform/ReportButton";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.requests.provider.inboxTitle };
}

export default async function ProviderRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageAccess("requests:respond", `/provider/requests/${id}`);
  const providerId = await getOwnedProviderId(user.id);
  // A provider sees a request only if it was matched to it; anything else is a 404.
  const view = providerId ? await providerRequest(providerId, id) : null;
  if (!view) notFound();
  const { t, locale } = await getServerDictionary();
  const p = t.requests.provider;
  const d = t.requests.detail;
  const r = view.request;
  const shortDate = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "UTC" });
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Dar_es_Salaam" });

  const canRespond = r.effective === "OPEN" && ["NOTIFIED", "INTERESTED", "QUOTED"].includes(view.matchStatus);
  const convoOpen = r.status !== "CANCELLED" && view.matchStatus !== "DECLINED" && view.matchStatus !== "NOT_SELECTED";
  const contact = r.customerContact;
  const pref = t.requests.new[`contact${r.contactPreference}`];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <MarkSeen requestId={r.id} />
      <Link href="/provider/requests" className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {p.back}
      </Link>

      {view.accepted && r.status === "ACCEPTED" && (
        <Alert tone="success">
          <strong>{p.acceptedTitle}.</strong> {p.acceptedBody}
        </Alert>
      )}
      {view.accepted && r.status === "COMPLETED" && <Alert tone="success">{p.completed}</Alert>}
      {view.matchStatus === "NOT_SELECTED" && <Alert tone="info">{p.notSelected}</Alert>}
      {r.status === "CANCELLED" && <Alert tone="info">{p.cancelled}</Alert>}
      {r.effective === "EXPIRED" && <Alert tone="info">{p.closed}</Alert>}

      <Card>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">{requestTitle(r, locale, t)}</h1>
          <StatusBadge status={r.effective} t={t} />
          {r.targetProviderId === providerId && <span className="rounded-full bg-accent-400/30 px-2 py-0.5 text-xs font-semibold">{p.direct}</span>}
        </div>
        <p className="mb-3 text-xs text-ink-subtle">
          {p.customer}: {r.customerName} · {fill(d.posted, { date: date.format(r.createdAt) })}
        </p>
        {/* Street address and contact details only after this provider is chosen. */}
        <RequestDetails r={r} t={t} locale={locale} address={r.addressText} />

        {contact && (
          <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
            <p className="mb-2 font-semibold">{d.chosenContact}</p>
            <p className="mb-2 text-xs text-ink-muted">{fill(p.contactPref, { pref })}</p>
            <div className="flex flex-wrap gap-2">
              {contact.phone && (
                <ButtonLink href={`tel:+${contact.phone}`} variant="secondary" className="min-h-10">
                  <Phone aria-hidden className="size-4" />
                  {formatPhone(contact.phone)}
                </ButtonLink>
              )}
              {contact.phone && (
                <ButtonLink href={`https://wa.me/${contact.phone}`} target="_blank" rel="noopener noreferrer" variant="secondary" className="min-h-10">
                  <MessageCircle aria-hidden className="size-4" />
                  {d.whatsapp}
                </ButtonLink>
              )}
              {contact.email && (
                <ButtonLink href={`mailto:${contact.email}`} variant="secondary" className="min-h-10">
                  <Mail aria-hidden className="size-4" />
                  {contact.email}
                </ButtonLink>
              )}
            </div>
          </div>
        )}
      </Card>

      {view.quote && !canRespond && (
        <Card className="text-sm">
          <p className="text-xs text-ink-subtle">
            {p.quoteTitle} · {p.quoteStatus[view.quote.status]}
          </p>
          <p className="text-lg font-bold">{formatTzs(view.quote.amount)}</p>
          {view.quote.validUntil && <p className="text-xs text-ink-subtle">{fill(d.quoteValid, { date: shortDate.format(view.quote.validUntil) })}</p>}
          {view.quote.note && <p className="mt-1 whitespace-pre-line text-ink-muted">{view.quote.note}</p>}
        </Card>
      )}

      {canRespond && (
        <Card>
          <ProviderResponse requestId={r.id} matchStatus={view.matchStatus} quote={view.quote} />
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">{d.messages}</h2>
        <Conversation matchId={view.matchId} messages={view.messages} me="PROVIDER" otherName={r.customerName} open={convoOpen} />
        <div className="mt-2 flex flex-wrap gap-4">
          <ReportButton targetType="REQUEST" targetId={r.id} />
          {view.messages.length > 0 && <ReportButton targetType="CONVERSATION" targetId={view.matchId} />}
        </div>
      </Card>
    </div>
  );
}
