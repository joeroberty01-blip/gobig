import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { providerInbox } from "@/lib/services/requests";
import { areaText, budgetText, requestTitle, StatusBadge, whenText } from "@/components/requests/RequestSummary";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.requests.provider.inboxTitle };
}

export default async function ProviderRequestsPage() {
  const user = await requirePageAccess("requests:respond", "/provider/requests");
  const { t, locale } = await getServerDictionary();
  const p = t.requests.provider;
  const providerId = await getOwnedProviderId(user.id);
  if (!providerId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={p.inboxTitle} />
        <Card className="flex flex-col items-start gap-3 text-sm text-ink-muted">
          {p.noBusiness}
          <ButtonLink href="/provider/setup/name">{t.provider.setupTitle}</ButtonLink>
        </Card>
      </div>
    );
  }
  const rows = await providerInbox(providerId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={p.inboxTitle} />
      {rows.length === 0 ? (
        <EmptyState icon={<Inbox aria-hidden />} title={p.inboxEmpty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((m) => (
            <li key={m.id}>
              <Link href={`/provider/requests/${m.request.id}`} className="block rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{requestTitle(m.request, locale, t)}</span>
                      <StatusBadge status={m.effective} t={t} />
                      <span className="text-xs text-ink-subtle">{t.requests.matchStatus[m.status]}</span>
                      {m.request.targetProviderId === providerId && <span className="rounded-full bg-accent-400/30 px-2 py-0.5 text-xs font-semibold">{p.direct}</span>}
                      {m.unread > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{fill(t.requests.detail.newMessages, { count: m.unread })}</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{m.request.description}</p>
                    <p className="mt-1.5 text-xs text-ink-subtle">
                      {areaText(m.request.location)} · {whenText(m.request, locale, t)} · {budgetText(m.request, t)}
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
