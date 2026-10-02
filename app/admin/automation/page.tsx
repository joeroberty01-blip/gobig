import Link from "next/link";
import type { Metadata } from "next";
import { Activity, CheckCircle2, CircleAlert } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { automationText } from "@/lib/i18n/automationCenter";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { allRuleSettings, registry } from "@/lib/automation/engine";
import { RULE_IDS } from "@/lib/automation/rules";
import { automationAudit, deadJobs, deliveryStats, overview, rulePerformance, runHistory } from "@/lib/automation/control";
import { RuleCards } from "@/components/admin/automation/RuleCards";
import { RetryButton } from "@/components/admin/automation/RetryButton";
import { oneOf, pageParam, qs } from "@/components/admin/platform/Bits";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerDictionary();
  return { title: automationText(locale).title };
}

const TABS = ["overview", "rules", "runs", "failed", "deliveries", "audit"] as const;
const RUN_STATUSES = ["DONE", "FAILED", "DEAD", "RUNNING"] as const;
const GROUP_ORDER = ["customers", "providers", "trust", "business", "trips", "system"] as const;

type SP = Record<string, string | string[] | undefined>;

/** Automation Engine, Phase I: one place to see, tune and repair everything that runs by itself. */
export default async function AutomationCenterPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requirePageAccess("admin-area:access", "/admin/automation");
  const { t, locale } = await getServerDictionary();
  const c = automationText(locale);
  const sp = await searchParams;
  const tab = oneOf(sp.tab, TABS) ?? "overview";
  const canEdit = can(actor, "settings:manage");
  const ruleTitle = (id: string) => (t.adminPlatform.settings.rules as Record<string, { title: string }>)[id]?.title ?? id;
  const time = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const retryText = { label: c.retry, doneLabel: c.retried, errorLabel: c.retryError };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={c.title} subtitle={c.intro} />
      <nav aria-label={c.title} className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/admin/automation${qs({ tab: x === "overview" ? null : x })}`}
            aria-current={x === tab ? "page" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${x === tab ? "bg-action text-white" : "bg-surface text-ink-muted ring-1 ring-line"}`}
          >
            {c.tabs[x]}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview c={c} ruleTitle={ruleTitle} time={time} />}
      {tab === "rules" && <Rules c={c} canEdit={canEdit} />}
      {tab === "runs" && <Runs c={c} sp={sp} ruleTitle={ruleTitle} time={time} />}
      {tab === "failed" && <Failed c={c} ruleTitle={ruleTitle} time={time} canEdit={canEdit} retryText={retryText} />}
      {tab === "deliveries" && <Deliveries c={c} />}
      {tab === "audit" && <Audit c={c} time={time} />}
    </div>
  );
}

type C = ReturnType<typeof automationText>;
type Fmt = Intl.DateTimeFormat;

async function Overview({ c, ruleTitle, time }: { c: C; ruleTitle: (id: string) => string; time: Fmt }) {
  const [o, perf, settings] = await Promise.all([overview(), rulePerformance(7), allRuleSettings()]);
  const on = RULE_IDS.filter((id) => settings.get(id)?.enabled).length;
  const issues = [o.queueDelayMin > 10 && c.healthHints.queue, o.deadRuns + o.deadJobs > 0 && c.healthHints.dead, o.runs24h.failed > 0 && c.healthHints.failures].filter((x): x is string => !!x);
  const cards: [string, string, boolean][] = [
    [c.cards.rules, `${on} / ${RULE_IDS.length}`, false],
    [c.cards.runs24h, String(o.runs24h.done), false],
    [c.cards.failed24h, String(o.runs24h.failed), o.runs24h.failed > 0],
    [c.cards.deadRuns, String(o.deadRuns), o.deadRuns > 0],
    [c.cards.jobsDue, String(o.jobsDue), o.jobsDue > 100],
    [c.cards.queueDelay, fill(c.minutes, { n: o.queueDelayMin }), o.queueDelayMin > 10],
    [c.cards.deadJobs, String(o.deadJobs), o.deadJobs > 0],
    [c.cards.delivered24h, String(o.deliveries24h.sent), false],
    [c.cards.openFlags, String(o.openFlags), o.openFlags > 0],
  ];
  const ok = issues.length === 0;
  return (
    <div className="flex flex-col gap-5">
      <section className={`flex items-start gap-3 rounded-2xl p-4 ${ok ? "bg-success-soft" : "bg-danger-soft"}`}>
        {ok ? <CheckCircle2 aria-hidden className="size-6 shrink-0 text-success" /> : <CircleAlert aria-hidden className="size-6 shrink-0 text-danger" />}
        <div>
          <p className="font-bold">{ok ? c.healthy : c.attention}</p>
          <ul className="mt-1 text-sm text-ink-muted">{(ok ? [c.healthHints.ok] : issues).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </section>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([label, value, warn]) => (
          <li key={label} className={`rounded-2xl border bg-surface p-4 ${warn ? "border-danger/40" : "border-line"}`}>
            <p className="text-xs text-ink-muted">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${warn ? "text-danger" : ""}`}>{value}</p>
          </li>
        ))}
      </ul>
      <Card className="overflow-x-auto">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Activity aria-hidden className="size-4 text-action" />
          {c.performance}
        </h2>
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-subtle">
              {[c.perf.rule, c.perf.runs, c.perf.failed, c.perf.avg, c.perf.p95, c.perf.last].map((h) => (
                <th key={h} scope="col" className="py-1.5 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {perf.map((p) => (
              <tr key={p.ruleId}>
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                  <Link href={`/admin/automation${qs({ tab: "runs", rule: p.ruleId })}`} className="hover:underline">
                    {ruleTitle(p.ruleId)}
                  </Link>
                </th>
                <td className="py-1.5 pr-3">{p.runs}</td>
                <td className={`py-1.5 pr-3 ${p.failed ? "font-semibold text-danger" : ""}`}>{p.failed}</td>
                <td className="py-1.5 pr-3">{p.avgMs == null ? c.perf.never : fill(c.ms, { n: p.avgMs })}</td>
                <td className="py-1.5 pr-3">{p.p95Ms == null ? c.perf.never : fill(c.ms, { n: p.p95Ms })}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-ink-muted">{p.lastRunAt ? time.format(p.lastRunAt) : c.perf.never}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

async function Rules({ c, canEdit }: { c: C; canEdit: boolean }) {
  const settings = await allRuleSettings();
  const rules = registry().filter((r) => RULE_IDS.includes(r.id));
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">{c.rulesHint}</p>
      {GROUP_ORDER.map((g) => {
        const list = rules.filter((r) => r.group === g);
        if (!list.length) return null;
        return (
          <section key={g} aria-labelledby={`group-${g}`}>
            <h2 id={`group-${g}`} className="mb-2 font-semibold">
              {c.groups[g]}
            </h2>
            <RuleCards
              canEdit={canEdit}
              rules={list.map((r) => ({
                id: r.id,
                trigger: r.trigger.kind === "schedule" ? { kind: "schedule" as const, every: r.trigger.every } : { kind: "event" as const },
                enabled: settings.get(r.id)!.enabled,
                params: settings.get(r.id)!.params as Record<string, number>,
                fields: r.fields,
              }))}
            />
          </section>
        );
      })}
    </div>
  );
}

function resultText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  return Object.entries(result as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

const STATUS_TONE: Record<string, string> = { DONE: "bg-success-soft text-success", FAILED: "bg-cta/15 text-cta", DEAD: "bg-danger-soft text-danger", RUNNING: "bg-canvas text-ink-muted", SKIPPED: "bg-canvas text-ink-muted" };

async function Runs({ c, sp, ruleTitle, time }: { c: C; sp: SP; ruleTitle: (id: string) => string; time: Fmt }) {
  const rule = typeof sp.rule === "string" && RULE_IDS.includes(sp.rule) ? sp.rule : null;
  const status = oneOf(sp.status, RUN_STATUSES);
  const h = await runHistory({ ruleId: rule, status, page: pageParam(sp.page) });
  const link = (over: Record<string, string | number | null>) => `/admin/automation${qs({ tab: "runs", rule, status, ...over })}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={link({ status: null, page: null })} className={`rounded-full px-3 py-1 ${!status ? "bg-ink text-canvas" : "bg-surface ring-1 ring-line"}`}>
          {c.allStatuses}
        </Link>
        {RUN_STATUSES.map((s) => (
          <Link key={s} href={link({ status: s, page: null })} className={`rounded-full px-3 py-1 ${status === s ? "bg-ink text-canvas" : "bg-surface ring-1 ring-line"}`}>
            {c.status[s]}
          </Link>
        ))}
        {rule && (
          <Link href={`/admin/automation${qs({ tab: "runs", status })}`} className="rounded-full bg-action/10 px-3 py-1 font-semibold text-action">
            {ruleTitle(rule)} ✕
          </Link>
        )}
      </div>
      {h.rows.length === 0 ? (
        <Card className="text-sm text-ink-muted">{c.noRuns}</Card>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {h.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={link({ rule: r.ruleId, page: null })} className="font-medium hover:underline">
                  {ruleTitle(r.ruleId)}
                </Link>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status]}`}>{c.status[r.status]}</span>
                {r.attempts > 1 && <span className="text-xs text-ink-subtle">{fill(c.attempts, { n: r.attempts })}</span>}
                <span className="ml-auto text-xs text-ink-subtle">{time.format(r.updatedAt)}</span>
              </div>
              <p className="text-xs text-ink-muted">
                {resultText(r.result)}
                {r.durationMs != null && ` · ${fill(c.ms, { n: r.durationMs })}`}
              </p>
              {r.error && <p className="font-mono text-xs break-all text-danger">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {h.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {h.page > 1 ? <Link href={link({ page: h.page - 1 })}>← {c.prev}</Link> : <span />}
          <span className="text-ink-subtle">{fill(c.pageOf, { page: h.page, pages: h.pages })}</span>
          {h.page < h.pages ? <Link href={link({ page: h.page + 1 })}>{c.next} →</Link> : <span />}
        </div>
      )}
    </div>
  );
}

async function Failed({ c, ruleTitle, time, canEdit, retryText }: { c: C; ruleTitle: (id: string) => string; time: Fmt; canEdit: boolean; retryText: { label: string; doneLabel: string; errorLabel: string } }) {
  const [runs, jobs] = await Promise.all([runHistory({ status: "DEAD" }), deadJobs()]);
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 font-semibold">{c.failedRuns}</h2>
        {runs.rows.length === 0 ? (
          <Card className="text-sm text-ink-muted">{c.noFailed}</Card>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {runs.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{ruleTitle(r.ruleId)}</p>
                  {r.error && <p className="font-mono text-xs break-all text-danger">{r.error}</p>}
                  <p className="text-xs text-ink-subtle">
                    {fill(c.attempts, { n: r.attempts })} · {time.format(r.updatedAt)}
                  </p>
                </div>
                {canEdit && <RetryButton kind="run" id={r.id} {...retryText} />}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-semibold">{c.failedJobs}</h2>
        {jobs.length === 0 ? (
          <Card className="text-sm text-ink-muted">{c.noFailed}</Card>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.jobTypes[j.type] ?? j.type}</p>
                  {j.lastError && <p className="font-mono text-xs break-all text-danger">{j.lastError}</p>}
                  <p className="text-xs text-ink-subtle">
                    {fill(c.attempts, { n: j.attempts })} · {time.format(j.updatedAt)}
                  </p>
                </div>
                {canEdit && <RetryButton kind="job" id={j.id} {...retryText} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function Deliveries({ c }: { c: C }) {
  const d = await deliveryStats(7);
  const empty = d.channels.every((x) => x.sent + x.skipped + x.failed + x.queued === 0);
  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-semibold">{c.deliveries}</h2>
        {empty ? (
          <p className="text-sm text-ink-muted">{c.noDeliveries}</p>
        ) : (
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-subtle">
                {[c.delivery.channel, c.delivery.sent, c.delivery.skipped, c.delivery.failed, c.delivery.queued, c.delivery.rate].map((h) => (
                  <th key={h} scope="col" className="py-1.5 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.channels.map((x) => (
                <tr key={x.channel}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                    {c.delivery[x.channel]}
                  </th>
                  <td className="py-1.5 pr-3">{x.sent}</td>
                  <td className="py-1.5 pr-3">{x.skipped}</td>
                  <td className={`py-1.5 pr-3 ${x.failed ? "font-semibold text-danger" : ""}`}>{x.failed}</td>
                  <td className="py-1.5 pr-3">{x.queued}</td>
                  <td className="py-1.5 pr-3">{x.successRate == null ? "—" : `${x.successRate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {d.reasons.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">{c.reasonsTitle}</h2>
          <ul className="divide-y divide-line text-sm">
            {d.reasons.map((r) => (
              <li key={`${r.channel}-${r.reason}`} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="mr-2 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold">{c.delivery[r.channel]}</span>
                  {c.reasons[r.reason] ?? r.reason}
                </span>
                <b>{r.count}</b>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function Audit({ c, time }: { c: C; time: Fmt }) {
  const rows = await automationAudit(40);
  return (
    <Card>
      <h2 className="mb-2 font-semibold">{c.auditTitle}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{c.noAudit}</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <span>
                <span className="font-medium">{c.auditActions[a.action] ?? a.action}</span>
                <span className="text-ink-muted"> · {resultText(a.metadata) || a.entityId}</span>
                <span className="block text-xs text-ink-subtle">{a.actorId ? (a.actorName ?? `${a.actorId.slice(0, 8)}…`) : c.system}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-subtle">{time.format(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
