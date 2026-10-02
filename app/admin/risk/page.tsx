import Link from "next/link";
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { riskText } from "@/lib/i18n/risk";
import { requirePageAccess } from "@/lib/session";
import { listRiskFlags } from "@/lib/services/admin/risk";
import { oneOf, qs } from "@/components/admin/platform/Bits";
import { RiskDecision } from "@/components/admin/RiskDecision";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerDictionary();
  return { title: riskText(locale).title };
}

const TABS = ["OPEN", "ACTIONED", "DISMISSED"] as const;
const SEVERITY_TONE = { HIGH: "bg-danger text-white", MEDIUM: "bg-cta/15 text-cta", LOW: "bg-canvas text-ink-muted" } as const;

// Automation Engine, Phase F: what the trust rules found, for an admin to decide on.
export default async function AdminRiskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("reports:manage", "/admin/risk");
  const { locale } = await getServerDictionary();
  const r = riskText(locale);
  const status = oneOf((await searchParams).status, TABS) ?? "OPEN";
  const flags = await listRiskFlags(status);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={r.title} subtitle={r.intro} />
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {TABS.map((s) => (
          <Link
            key={s}
            href={`/admin/risk${qs({ status: s === "OPEN" ? null : s })}`}
            aria-current={s === status ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 font-semibold ${s === status ? "bg-action text-white" : "bg-surface text-ink-muted ring-1 ring-line"}`}
          >
            {r.tabs[s]}
          </Link>
        ))}
        <Link href="/admin/settings" className="ml-auto font-semibold text-action underline">
          {r.rulesLink}
        </Link>
      </nav>
      {flags.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{r.none}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {flags.map((f) => {
            const d = (f.details ?? {}) as Record<string, string | number>;
            return (
              <li key={f.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldAlert aria-hidden className="size-5 text-action" />
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SEVERITY_TONE[f.severity]}`}>{r.severity[f.severity]}</span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold">{r.subject[f.subjectType as "PROVIDER" | "USER"] ?? f.subjectType}</span>
                    {f.subject ? (
                      <Link href={f.subject.href} className="font-semibold text-action underline">
                        {f.subject.name}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-ink-subtle">{f.subjectId}</span>
                    )}
                    <span className="ml-auto text-xs text-ink-subtle">{date.format(f.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{fill(r.kinds[f.kind], d)}</p>
                  {f.status === "OPEN" ? (
                    <RiskDecision id={f.id} text={{ note: r.note, noteHint: r.noteHint, handled: r.handled, dismiss: r.dismiss, error: r.error }} />
                  ) : (
                    <p className="mt-2 text-xs text-ink-muted">
                      {fill(r.resolvedBy, { date: f.resolvedAt ? date.format(f.resolvedAt) : "" })}
                      {f.note && ` · ${f.note}`}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
