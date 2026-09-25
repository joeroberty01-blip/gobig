import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { reportDetail } from "@/lib/services/admin/oversight";
import { ReasonAction, ReportDecision } from "@/components/admin/platform/Controls";
import { Alert, Card } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.reports.title };
}

export default async function AdminReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageAccess("reports:manage", `/admin/reports/${id}`);
  const report = await reportDetail(actor.id, id);
  if (!report) notFound();
  const { t, locale } = await getServerDictionary();
  const r = t.adminPlatform.reports;
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const provider =
    report.targetType === "PROVIDER"
      ? await prisma.provider.findUnique({ where: { id: report.targetId }, select: { id: true, slug: true, status: true, profile: { select: { displayName: true } } } })
      : report.conversation?.provider
        ? await prisma.provider.findUnique({ where: { id: report.conversation.provider.id }, select: { id: true, slug: true, status: true, profile: { select: { displayName: true } } } })
        : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/admin/reports" className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {r.title}
      </Link>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold">{r.targets[report.targetType]}</span>
          <h1 className="text-lg font-bold">{r.reasons[report.reason]}</h1>
          <span className="text-xs text-ink-subtle">{r.tabs[report.status]}</span>
        </div>
        {report.note && <p className="text-sm whitespace-pre-line">{report.note}</p>}
        <p className="text-xs text-ink-subtle">
          {fill(r.reportedBy, { name: report.reporter.name })} ({t.roles[report.reporter.role]}) · {date.format(report.createdAt)}
        </p>
        {report.resolution && <Alert tone="info">{report.resolution}</Alert>}
      </Card>

      {provider && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm">
            {r.provider}:{" "}
            <Link href={`/p/${provider.slug}`} className="font-semibold underline">
              {provider.profile?.displayName ?? provider.slug}
            </Link>{" "}
            <span className="text-xs text-ink-subtle">({t.adminPlatform.providers[`status${provider.status}`]})</span>
          </p>
          {provider.status !== "SUSPENDED" && (
            <ReasonAction action={{ kind: "suspendProvider", id: provider.id }} label={t.adminPlatform.providers.suspend} hint={t.adminPlatform.providers.suspendHint} danger />
          )}
        </Card>
      )}

      {report.request && (
        <Card className="flex flex-col gap-2 text-sm">
          <p>
            {r.customer}:{" "}
            <Link href={`/admin/users/${report.request.customer.id}`} className="font-semibold underline">
              {report.request.customer.name}
            </Link>{" "}
            · {report.request.location.name} · {report.request.status}
          </p>
          <p className="whitespace-pre-line text-ink-muted">{report.request.description}</p>
          {(report.request.status === "OPEN" || report.request.status === "ACCEPTED") && (
            <ReasonAction action={{ kind: "cancelRequest", id: report.request.id }} label={t.adminPlatform.requests.cancel} hint={t.adminPlatform.requests.cancelHint} danger />
          )}
        </Card>
      )}

      {report.conversation && (
        <Card className="flex flex-col gap-2">
          <Alert tone="info">{r.conversationNote}</Alert>
          <p className="text-sm">
            {r.customer}:{" "}
            <Link href={`/admin/users/${report.conversation.request.customer.id}`} className="font-semibold underline">
              {report.conversation.request.customer.name}
            </Link>
          </p>
          <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto text-sm">
            {report.conversation.messages.map((m) => (
              <li key={m.id} className={`rounded-xl px-3 py-2 ${m.senderRole === "CUSTOMER" ? "bg-canvas" : "bg-brand-50"}`}>
                <span className="block text-xs text-ink-subtle">
                  {m.senderRole === "CUSTOMER" ? r.customer : r.provider} · {date.format(m.createdAt)}
                </span>
                <span className="whitespace-pre-line">{m.body}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {report.status === "OPEN" && (
        <Card>
          <ReportDecision id={report.id} />
        </Card>
      )}
    </div>
  );
}
