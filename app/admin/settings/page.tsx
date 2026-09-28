import type { Metadata } from "next";
import { Activity, Bot, CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/kv";
import { encryptionConfigured } from "@/lib/crypto/fieldCipher";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { PlatformSettingsForm } from "@/components/admin/platform/Controls";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.settings.title };
}

const AUTOMATION_ACTIONS = ["review.auto_hidden", "automation.request_reminders", "automation.drivers_offline"] as const;

/** Settings centre (Phase 17): live system status, every platform setting, automation and its activity. */
export default async function AdminSettingsPage() {
  // Admins can see the settings; only a super admin can change them.
  const actor = await requirePageAccess("admin-area:access", "/admin/settings");
  const { t, locale } = await getServerDictionary();
  const s = t.adminPlatform.settings;
  const [settings, db, jobsWaiting, jobsDead, driversOnline, lastAutomation, activity] = await Promise.all([
    getPlatformSettings({ fresh: true }),
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
    prisma.job.count({ where: { status: { in: ["PENDING", "RUNNING"] }, runAt: { lte: new Date() } } }),
    prisma.job.count({ where: { status: "DEAD" } }),
    prisma.driverProfile.count({ where: { online: true } }),
    prisma.job.findFirst({ where: { type: "automation", status: "DONE" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.auditLog.findMany({ where: { action: { in: [...AUTOMATION_ACTIONS] } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, metadata: true, createdAt: true } }),
  ]);
  const r = redis();
  const time = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const encryption = encryptionConfigured();

  type Tone = "ok" | "bad" | "idle";
  const status: { label: string; value: string; tone: Tone }[] = [
    { label: s.statusDb, value: db ? s.up : s.down, tone: db ? "ok" : "bad" },
    { label: s.statusRedis, value: !r ? s.notConfigured : r.status === "ready" ? s.up : s.down, tone: !r ? "idle" : r.status === "ready" ? "ok" : "bad" },
    { label: s.statusEncryption, value: encryption ? s.configured : s.missing, tone: encryption ? "ok" : "bad" },
    { label: s.statusJobs, value: String(jobsWaiting), tone: jobsWaiting > 100 ? "bad" : "ok" },
    { label: s.statusDead, value: String(jobsDead), tone: jobsDead ? "bad" : "ok" },
    { label: s.statusDrivers, value: String(driversOnline), tone: driversOnline ? "ok" : "idle" },
    { label: s.statusLastAutomation, value: lastAutomation ? time.format(lastAutomation.updatedAt) : s.never, tone: lastAutomation ? "ok" : "idle" },
  ];
  const ICON = { ok: CheckCircle2, bad: CircleAlert, idle: CircleDashed };
  const sections = s.sections;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={s.title} subtitle={s.intro} />

      {/* Jump between sections (stays in view while scrolling). */}
      <nav aria-label={s.title} className="sticky top-14 z-10 -mx-4 mb-4 flex gap-1.5 overflow-x-auto bg-canvas/90 px-4 py-2 backdrop-blur no-scrollbar sm:top-16 md:mx-0 md:rounded-xl md:px-2">
        {(
          [
            ["status", sections.status],
            ["support", sections.general],
            ["features", sections.features],
            ["requests", sections.requests],
            ["trips", sections.trips],
            ["automation", sections.automation],
            ["activity", sections.activity],
          ] as const
        ).map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-link/40">
            {label}
          </a>
        ))}
      </nav>

      <section id="status" className="mb-4 scroll-mt-24 overflow-hidden rounded-2xl nav-gradient p-5 text-white shadow-lift">
        <h2 className="flex items-center gap-2 font-bold">
          <Activity aria-hidden className="size-5" />
          {s.status}
        </h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {status.map((x) => {
            const Icon = ICON[x.tone];
            return (
              <li key={x.label} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 text-sm">
                <Icon aria-hidden className={`size-4 shrink-0 ${x.tone === "ok" ? "text-emerald-300" : x.tone === "bad" ? "text-orange-300" : "text-white/50"}`} />
                <span className="min-w-0 flex-1 text-white/80">{x.label}</span>
                <b className="text-right">{x.value}</b>
              </li>
            );
          })}
        </ul>
      </section>

      <PlatformSettingsForm initial={settings} canEdit={can(actor, "settings:manage")} />

      <section id="activity" className="mt-4 scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <h2 className="flex items-center gap-2 font-bold">
          <Bot aria-hidden className="size-5 text-link" />
          {s.activity}
        </h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">{s.activityEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {activity.map((a) => {
              const m = (a.metadata ?? {}) as Record<string, string | number>;
              const text = s.activityActions[a.action as (typeof AUTOMATION_ACTIONS)[number]];
              return (
                <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span>{fill(text, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)])))}</span>
                  <span className="shrink-0 text-xs text-ink-subtle">{time.format(a.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
