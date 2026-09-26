import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronRight, Circle, ClipboardList, CreditCard, Eye, MessageSquareText, Store } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { getEditorData } from "@/lib/data/provider";
import { SETUP_STEPS } from "@/lib/provider/steps";
import { PublishControls } from "@/components/provider/PublishControls";
import { dashboardToday, type DayPair } from "@/lib/services/metrics";
import { providerInbox } from "@/lib/services/requests";
import { requestTitle, StatusBadge, areaText } from "@/components/requests/RequestSummary";
import { ButtonLink, Card, EmptyState } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.provider.dashboardTitle };
}

const STATUS_STYLE = {
  DRAFT: "bg-canvas text-ink-muted ring-line",
  ACTIVE: "bg-success-soft text-success ring-success/25",
  PENDING_REVIEW: "bg-brand-50 text-brand-900 ring-brand-100",
  SUSPENDED: "bg-danger-soft text-danger ring-danger/25",
} as const;

/** Hour of day in Dar es Salaam (UTC+3). */
function darHour(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3_600_000).getUTCHours();
}

function greeting(t: Dictionary, name: string): string {
  const h = darHour();
  const first = name.trim().split(/\s+/)[0] ?? name;
  const key = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return fill(t.ui.dashboard[key], { name: first });
}

// Provider dashboard (Phase 14): today at a glance, how findable the profile is, the latest
// requests. Every number is measured; nothing is shown that GO BIG doesn't record (no earnings).
export default async function ProviderDashboardPage() {
  const user = await requirePageAccess("provider-area:access", "/provider");
  const { t, locale } = await getServerDictionary();
  const d = t.ui.dashboard;
  const providerId = await getOwnedProviderId(user.id);

  if (!providerId) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {greeting(t, user.name)} <span aria-hidden>👋</span>
        </h1>
        <p className="mb-6 text-sm text-ink-muted">{fill(t.provider.greeting, { name: user.name })}</p>
        <EmptyState
          icon={<Store aria-hidden />}
          title={t.profile.dashboard.startTitle}
          body={t.profile.dashboard.startBody}
          action={<ButtonLink href="/provider/setup/name">{t.profile.dashboard.start}</ButtonLink>}
        />
      </div>
    );
  }

  const [data, today, inbox] = await Promise.all([getEditorData(providerId), dashboardToday(providerId), providerInbox(providerId)]);
  const { completion, status } = data;
  // Resume onboarding at the first step after the furthest one reached, until the profile is live.
  const resumeStep = SETUP_STEPS[Math.min((data.profile?.onboardingStep ?? 0) + 1, SETUP_STEPS.length - 1)];
  const onboarding = status === "DRAFT" && !data.publishedAt;
  const missing = completion.missingRequired.map((k) => t.profile.completion.items[k]).join(", ");
  const nextItems = [...completion.items.filter((i) => !i.done && i.required), ...completion.items.filter((i) => !i.done && !i.required)].slice(0, 4);
  const dateLabel = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Dar_es_Salaam" }).format(new Date());

  const tiles = [
    { label: d.profileViews, pair: today.views, Icon: Eye, tint: "#2563eb" },
    { label: d.whatsappClicks, pair: today.whatsapp, Icon: MessageSquareText, tint: "#1fa855" },
    { label: d.serviceRequests, pair: today.requests, Icon: ClipboardList, tint: "#7c3aed", href: "/provider/requests" },
    { label: d.newReviews, pair: today.reviews, Icon: BadgeCheck, tint: "#d97706", href: "/provider/reviews" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting(t, user.name)} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{d.todayIntro}</p>
        </div>
        <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted shadow-soft">{dateLabel}</span>
      </div>

      {/* Listing status and the one next step. */}
      <Card className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">{d.liveStatus}</p>
          <p className="mt-1 truncate text-lg font-bold">{data.profile?.displayName}</p>
          <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>{t.profile.dashboard[`status${status}`]}</span>
          {status === "DRAFT" && !completion.canPublish && <p className="mt-2 text-sm text-ink-muted">{fill(t.profile.dashboard.missingToPublish, { items: missing })}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
        <section aria-label={d.today} className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map(({ label, pair, Icon, tint, href }) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl font-extrabold tracking-tight tabular-nums">{pair.today.toLocaleString("en-US")}</span>
                  <span className="grid size-9 place-items-center rounded-full" style={{ color: tint, background: `color-mix(in oklab, ${tint} 14%, transparent)` }}>
                    <Icon aria-hidden className="size-4.5" />
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold">{label}</p>
                <Delta pair={pair} t={t} />
              </>
            );
            return href ? (
              <Link key={label} href={href} className="rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                {body}
              </Link>
            ) : (
              <div key={label} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                {body}
              </div>
            );
          })}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{d.visibility}</h2>
              <p className="mt-0.5 text-sm text-ink-muted">{completion.percent >= 100 ? d.visibilityDone : d.visibilityHint}</p>
            </div>
            <span className="text-3xl font-extrabold tracking-tight text-brand-700 tabular-nums">{completion.percent}%</span>
          </div>
          <div className="relative mt-4 h-2.5 rounded-full bg-line" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label={d.visibility}>
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all duration-700" style={{ width: `${completion.percent}%` }} />
          </div>
          {nextItems.length > 0 && (
            <ul className="mt-5 flex flex-col gap-1">
              {nextItems.map((i) => (
                <li key={i.key}>
                  <Link
                    href={`/provider/setup/${t.profile.completion.itemStep[i.key]}?edit=1`}
                    className="flex min-h-10 items-center gap-3 rounded-xl px-2 text-sm transition hover:bg-canvas"
                  >
                    {i.done ? <Check aria-hidden className="size-4.5 text-success" /> : <Circle aria-hidden className={`size-4.5 ${i.required ? "text-accent-500" : "text-ink-subtle"}`} />}
                    <span className="flex-1">{t.profile.completion.items[i.key]}</span>
                    <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ButtonLink href="/provider/profile" variant="night" className="mt-4 w-full sm:w-auto">
            {d.completeProfile}
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{d.recentRequests}</h2>
            {inbox.length > 0 && (
              <Link href="/provider/requests" className="flex items-center text-sm font-semibold text-brand-700">
                {d.viewAll}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
          {inbox.length === 0 ? (
            <p className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-ink-muted">{d.noRequests}</p>
          ) : (
            <ul className="divide-y divide-line">
              {inbox.slice(0, 4).map((m) => (
                <li key={m.id}>
                  <Link href={`/provider/requests/${m.request.id}`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                      <ClipboardList aria-hidden className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{requestTitle(m.request, locale, t)}</span>
                      <span className="block truncate text-xs text-ink-muted">{areaText(m.request.location)}</span>
                    </span>
                    <StatusBadge status={m.effective} t={t} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-ink-subtle uppercase">{d.quickLinks}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/provider/insights", label: t.ui.nav.analytics, Icon: Eye },
          { href: "/provider/verification", label: t.nav.verification, Icon: BadgeCheck },
          { href: "/provider/plan", label: t.billing.nav, Icon: CreditCard },
        ].map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-sm font-semibold shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <Icon aria-hidden className="size-5 text-brand-700" />
            <span className="flex-1">{label}</span>
            <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** "↑ 3 vs yesterday" — the raw difference; percentages of tiny numbers mislead. */
function Delta({ pair, t }: { pair: DayPair; t: Dictionary }) {
  const diff = pair.today - pair.yesterday;
  if (diff === 0) return <p className="mt-1 text-xs text-ink-subtle">{t.ui.dashboard.sameAsYesterday}</p>;
  const up = diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-ink-muted"}`}>
      <Icon aria-hidden className="size-3.5" />
      {fill(t.ui.dashboard.vsYesterday, { value: `${up ? "+" : "−"}${Math.abs(diff)}` })}
    </p>
  );
}
