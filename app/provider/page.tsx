import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronRight, Circle, ClipboardList, CreditCard, Eye, MapPin, MessageSquareText, Settings, Store } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { getEditorData } from "@/lib/data/provider";
import { SETUP_STEPS } from "@/lib/provider/steps";
import { PublishControls } from "@/components/provider/PublishControls";
import { dashboardToday, providerAnalytics, type DayPair } from "@/lib/services/metrics";
import { DailyBars } from "@/components/insights/DailyBars";
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
// requests. Every number is measured; nothing is shown that Go Big doesn't record (no earnings).
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

  const [data, today, inbox, month] = await Promise.all([getEditorData(providerId), dashboardToday(providerId), providerInbox(providerId), providerAnalytics(providerId, 30)]);
  const { completion, status } = data;
  // Resume onboarding at the first step after the furthest one reached, until the profile is live.
  const resumeStep = SETUP_STEPS[Math.min((data.profile?.onboardingStep ?? 0) + 1, SETUP_STEPS.length - 1)];
  const onboarding = status === "DRAFT" && !data.publishedAt;
  const missing = completion.missingRequired.map((k) => t.profile.completion.items[k]).join(", ");
  const nextItems = [...completion.items.filter((i) => !i.done && i.required), ...completion.items.filter((i) => !i.done && !i.required)].slice(0, 4);

  const tiles = [
    { label: d.profileViews, pair: today.views, Icon: Eye, tint: "#2563eb" },
    { label: d.whatsappClicks, pair: today.whatsapp, Icon: MessageSquareText, tint: "#1fa855" },
    { label: d.serviceRequests, pair: today.requests, Icon: ClipboardList, tint: "#7c3aed", href: "/provider/requests" },
    { label: d.newReviews, pair: today.reviews, Icon: BadgeCheck, tint: "#d97706", href: "/provider/reviews" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-night-900 text-lg font-extrabold text-white">
          {(data.profile?.displayName ?? user.name).trim().slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">{greeting(t, user.name)}</p>
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{data.profile?.displayName ?? user.name}</h1>
          <p className={`flex items-center gap-1.5 text-xs font-semibold ${status === "ACTIVE" ? "text-success" : "text-ink-muted"}`}>
            <span className={`size-1.5 rounded-full ${status === "ACTIVE" ? "bg-success" : "bg-ink-subtle"}`} />
            {/* The short form ("Live", "Draft"…) as in the reference header. */}
            {t.profile.dashboard[`status${status}`].split(" — ")[0]}
          </p>
        </div>
        <Link href="/provider/more" aria-label={t.ui.more.title} className="grid size-10 place-items-center rounded-xl text-ink-muted transition hover:bg-surface hover:text-ink">
          <Settings aria-hidden className="size-5" />
        </Link>
      </div>

      {status === "ACTIVE" && (
        <section aria-label={d.today} className="mb-5 grid grid-cols-4 divide-x divide-white/10 rounded-2xl bg-night-900 px-1 py-4 text-white shadow-lift">
          {tiles.map(({ label, pair, Icon, href }) => {
            const body = (
              <>
                <Icon aria-hidden className="size-5 text-white/70" />
                <span className="mt-2 text-2xl font-extrabold tabular-nums sm:text-3xl">{pair.today.toLocaleString("en-US")}</span>
                <span className="mt-0.5 text-[11px] leading-tight text-white/75 sm:text-xs">{label}</span>
                <Delta pair={pair} t={t} onDark />
              </>
            );
            const cls = "flex min-w-0 flex-col items-center px-1.5 text-center";
            return href ? (
              <Link key={label} href={href} className={`${cls} transition hover:opacity-85`}>
                {body}
              </Link>
            ) : (
              <div key={label} className={cls}>
                {body}
              </div>
            );
          })}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <h2 className="text-lg font-bold">{d.visibility}</h2>
          <div className="mt-3 flex items-center gap-4">
            <Ring percent={completion.percent} label={d.visibility} />
            <div className="min-w-0 flex-1">
              <div className="h-2 rounded-full bg-line">
                <div className="h-full rounded-full bg-link transition-all duration-700" style={{ width: `${completion.percent}%` }} />
              </div>
              <p className="mt-2 text-sm text-ink-muted">{completion.percent >= 100 ? d.visibilityDone : d.visibilityHint}</p>
            </div>
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
              <Link href="/provider/requests" className="flex items-center text-sm font-semibold text-link">
                {d.viewAll}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
          {inbox.length === 0 ? (
            <p className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-ink-muted">{d.noRequests}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {inbox.slice(0, 3).map((m) => (
                <li key={m.id} className="rounded-2xl border border-line p-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-ink">
                      <ClipboardList aria-hidden className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{requestTitle(m.request, locale, t)}</span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
                        <MapPin aria-hidden className="size-3.5 shrink-0" />
                        {areaText(m.request.location)}
                      </span>
                    </span>
                    <StatusBadge status={m.effective} t={t} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ButtonLink href={`/provider/requests/${m.request.id}`} variant="cta" className="min-h-9 rounded-full">
                      {d.respond}
                    </ButtonLink>
                    <ButtonLink href={`/provider/requests/${m.request.id}`} variant="secondary" className="min-h-9 rounded-full">
                      {d.view}
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Listing status and the one next step. */}
      <Card className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{d.yourProfile}</h2>
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
        <Card className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold">{t.insights.trend.views}</h2>
            <span className="text-xs text-ink-subtle">{t.insights.periods[30]}</span>
          </div>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">{month.views.count.toLocaleString("en-US")}</p>
          <div className="mt-3">
            <DailyBars title={t.insights.trend.views} days={month.series.map((s) => s.day.toISOString())} values={month.series.map((s) => s.views)} locale={locale} />
          </div>
        </Card>
      )}

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

/** Profile completeness as a ring (reference design). */
function Ring({ percent, label }: { percent: number; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-20 shrink-0" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" className="stroke-line" />
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-link transition-all duration-700" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-extrabold tabular-nums">{percent}%</span>
    </div>
  );
}

/** "↑ 3 vs yesterday" — the raw difference; percentages of tiny numbers mislead. */
function Delta({ pair, t, onDark = false }: { pair: DayPair; t: Dictionary; onDark?: boolean }) {
  const diff = pair.today - pair.yesterday;
  if (diff === 0) return <p className={`mt-1 text-[10px] ${onDark ? "text-white/50" : "text-xs text-ink-subtle"}`}>{t.ui.dashboard.sameAsYesterday}</p>;
  const up = diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`mt-1 flex items-center gap-0.5 font-medium ${onDark ? "text-[10px]" : "text-xs"} ${up ? (onDark ? "text-brand-500" : "text-success") : onDark ? "text-white/50" : "text-ink-muted"}`}>
      <Icon aria-hidden className="size-3.5" />
      {fill(t.ui.dashboard.vsYesterday, { value: `${up ? "+" : "−"}${Math.abs(diff)}` })}
    </p>
  );
}
