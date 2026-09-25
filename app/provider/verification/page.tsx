import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { activeLevels, providerVerificationState } from "@/lib/services/verification";
import { OpenRequest, StartVerification } from "@/components/trust/VerificationForms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trust.provider.title };
}

export default async function ProviderVerificationPage() {
  const user = await requirePageAccess("verification:request", "/provider/verification");
  const { t, locale } = await getServerDictionary();
  const providerId = await getOwnedProviderId(user.id);
  if (!providerId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title={t.trust.provider.title} subtitle={t.errors.noBusinessYet} />
        <ButtonLink href="/provider/setup/name">{t.profile.dashboard.start}</ButtonLink>
      </div>
    );
  }

  const [state, levels] = await Promise.all([providerVerificationState(providerId), activeLevels()]);
  const currentRank = state.verificationLevel?.rank ?? 0;
  const available = levels.filter((l) => l.rank > currentRank);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium" });
  const past = state.history.filter((r) => r.id !== state.open?.id);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t.trust.provider.title} subtitle={t.trust.provider.intro} />

      <Card className="mb-4 flex items-center gap-3">
        <BadgeCheck aria-hidden className={`size-8 shrink-0 ${state.verificationLevel ? "text-brand-700" : "text-line"}`} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t.trust.provider.currentLevel}</p>
          <p className="font-semibold">{state.verificationLevel ? name(state.verificationLevel) : t.trust.provider.notVerified}</p>
        </div>
      </Card>

      {state.open ? (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="font-semibold">{name(state.open.level)}</h2>
            <p className="text-sm text-ink-muted">{t.trust.verificationStatus[state.open.status]}</p>
          </div>
          <OpenRequest
            request={{
              id: state.open.id,
              status: state.open.status as "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED",
              decisionNote: state.open.decisionNote,
              requiredDocuments: state.open.level.requiredDocuments,
              documents: state.open.documents,
            }}
          />
        </Card>
      ) : available.length > 0 ? (
        <Card>
          <StartVerification levels={available} />
        </Card>
      ) : null}

      {past.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-subtle uppercase">{t.trust.provider.history}</h2>
          <ul className="flex flex-col gap-2">
            {past.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{name(r.level)}</span>
                  <span className="text-ink-muted">{t.trust.verificationStatus[r.status]}</span>
                </div>
                {r.submittedAt && <p className="text-xs text-ink-subtle">{fill(t.trust.provider.submittedOn, { date: date.format(r.submittedAt) })}</p>}
                {r.decisionNote && (
                  <p className="mt-2 text-ink-muted">
                    <strong>{t.trust.provider.reviewerNote}:</strong> {r.decisionNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
