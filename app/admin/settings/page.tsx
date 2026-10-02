import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Bot, CheckCircle2, ChevronRight, CircleAlert, CircleDashed } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
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

/** Settings centre (Phase 17): live system status and every platform setting. Automation has its own Control Center (Phase I). */
export default async function AdminSettingsPage() {
  // Admins can see the settings; only a super admin can change them.
  const actor = await requirePageAccess("admin-area:access", "/admin/settings");
  const { t, locale } = await getServerDictionary();
  const s = t.adminPlatform.settings;
  const [settings, db, jobsWaiting, jobsDead, driversOnline, lastAutomation] = await Promise.all([
    getPlatformSettings({ fresh: true }),
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
    prisma.job.count({ where: { status: { in: ["PENDING", "RUNNING"] }, runAt: { lte: new Date() } } }),
    prisma.job.count({ where: { status: "DEAD" } }),
    prisma.driverProfile.count({ where: { online: true } }),
    prisma.automationRun.findFirst({ where: { status: { in: ["DONE", "SKIPPED"] } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
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

      <Link
        id="automation"
        href="/admin/automation"
        className="mt-4 flex scroll-mt-24 items-center gap-3 rounded-2xl border border-line bg-surface p-5 shadow-soft transition hover:shadow-lift"
      >
        <span className="grid size-10 place-items-center rounded-full bg-action/10 text-action">
          <Bot aria-hidden className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block font-bold">{s.automationCenter}</span>
          <span className="block text-sm text-ink-muted">{s.automationCenterHint}</span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-ink-subtle" />
      </Link>
    </div>
  );
}
