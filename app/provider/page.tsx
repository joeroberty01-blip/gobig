import type { Metadata } from "next";
import { BadgeCheck, ChartColumn, ChevronRight, CreditCard, Eye, Store } from "lucide-react";
import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { getEditorData } from "@/lib/data/provider";
import { SETUP_STEPS } from "@/lib/provider/steps";
import { CompletionBar, CompletionChecklist } from "@/components/provider/Completion";
import { PublishControls } from "@/components/provider/PublishControls";
import { providerAnalytics } from "@/lib/services/metrics";
import { ButtonLink, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.provider.dashboardTitle };
}

const STATUS_STYLE = {
  DRAFT: "bg-canvas text-ink-muted",
  ACTIVE: "bg-success-soft text-success",
  PENDING_REVIEW: "bg-brand-50 text-brand-900",
  SUSPENDED: "bg-danger-soft text-danger",
} as const;

export default async function ProviderDashboardPage() {
  const user = await requirePageAccess("provider-area:access", "/provider");
  const { t } = await getServerDictionary();
  const providerId = await getOwnedProviderId(user.id);

  if (!providerId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={t.provider.dashboardTitle} subtitle={fill(t.provider.greeting, { name: user.name })} />
        <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <Store aria-hidden className="size-6" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold">{t.profile.dashboard.startTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t.profile.dashboard.startBody}</p>
          </div>
          <ButtonLink href="/provider/setup/name" className="w-full sm:w-auto">
            {t.profile.dashboard.start}
          </ButtonLink>
        </Card>
      </div>
    );
  }

  const [data, insights] = await Promise.all([getEditorData(providerId), providerAnalytics(providerId, 30)]);
  const { completion, status } = data;
  // Resume onboarding at the first step after the furthest one reached, until the profile is live.
  const resumeStep = SETUP_STEPS[Math.min((data.profile?.onboardingStep ?? 0) + 1, SETUP_STEPS.length - 1)];
  const onboarding = status === "DRAFT" && !data.publishedAt;
  const missing = completion.missingRequired.map((k) => t.profile.completion.items[k]).join(", ");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={data.profile?.displayName ?? t.provider.dashboardTitle} subtitle={fill(t.provider.greeting, { name: user.name })} />

      <Card className="flex flex-col gap-4">
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>
          {t.profile.dashboard[`status${status}`]}
        </span>
        <CompletionBar percent={completion.percent} t={t} />
        {status === "DRAFT" && !completion.canPublish && (
          <p className="text-sm text-ink-muted">{fill(t.profile.dashboard.missingToPublish, { items: missing })}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {onboarding && !completion.canPublish && (
            <ButtonLink href={`/provider/setup/${resumeStep}`} className="w-full sm:w-auto">
              {t.profile.dashboard.continueSetup}
            </ButtonLink>
          )}
          <PublishControls status={status} canPublish={completion.canPublish} />
          <ButtonLink href={`/p/${data.slug}`} variant="secondary" className="w-full sm:w-auto">
            <Eye aria-hidden className="size-4" />
            {status === "ACTIVE" ? t.profile.dashboard.viewProfile : t.profile.dashboard.previewProfile}
          </ButtonLink>
        </div>
      </Card>

      {status === "ACTIVE" && (
        // Phase 10: the last 30 days at a glance; the full breakdown is on the Insights tab.
        <Link href="/provider/insights" className="mt-4 block rounded-2xl border border-line bg-surface p-4 hover:border-brand-500">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold">
              <ChartColumn aria-hidden className="size-4 text-brand-700" />
              {t.insights.title}
            </span>
            <ChevronRight aria-hidden className="size-5 text-ink-subtle" />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              [t.insights.funnel.appearances, insights.appearances.count],
              [t.insights.funnel.views, insights.views.count],
              [t.insights.funnel.taps, insights.taps.count],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{(value as number).toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-subtle">{t.insights.periods[30]}</p>
        </Link>
      )}

      <Link href="/provider/plan" className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4 font-semibold hover:border-brand-500">
        <span className="flex items-center gap-2">
          <CreditCard aria-hidden className="size-4 text-brand-700" />
          {t.billing.nav}
        </span>
        <ChevronRight aria-hidden className="size-5 text-ink-subtle" />
      </Link>

      <Link href="/provider/verification" className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4 font-semibold hover:border-brand-500">
        <span className="flex items-center gap-2">
          <BadgeCheck aria-hidden className="size-4 text-brand-700" />
          {t.nav.verification}
        </span>
        <ChevronRight aria-hidden className="size-5 text-ink-subtle" />
      </Link>

      <h2 className="mt-8 mb-3 text-lg font-semibold">{t.profile.dashboard.sections}</h2>
      <CompletionChecklist completion={completion} t={t} />
    </div>
  );
}
