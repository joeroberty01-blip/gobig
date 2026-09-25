import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { formatPhone } from "@/lib/phone";
import { requestForReview } from "@/lib/services/verification";
import { auditTrail } from "@/lib/services/audit";
import { DecisionForm, RevokeForm } from "@/components/trust/AdminTrustForms";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.trust.admin.verificationTitle, robots: { index: false } };
}

export default async function AdminVerificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageAccess("verification:review", `/admin/verification/${id}`);
  const { t, locale } = await getServerDictionary();
  const r = await requestForReview(id);
  if (!r) notFound();
  const trail = await auditTrail("VerificationRequest", r.id);
  const name = (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const owner = r.provider.members[0]?.user;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/verification" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-ink-muted">
        <ArrowLeft aria-hidden className="size-4" />
        {t.trust.admin.verificationTitle}
      </Link>
      <PageHeader title={r.provider.profile?.displayName ?? r.provider.slug} subtitle={`${name(r.level)} · ${t.trust.verificationStatus[r.status]}`} />

      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-1 font-semibold">{fill(t.trust.admin.documents, { count: r.documents.length })}</h2>
            <p className="mb-3 text-xs text-ink-subtle">{t.trust.admin.viewHint}</p>
            <ul className="divide-y divide-line">
              {r.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3 text-sm">
                  <FileText aria-hidden className="size-5 text-ink-subtle" />
                  <span className="flex-1">
                    <span className="block font-medium">{t.trust.docTypes[d.type]}</span>
                    <span className="text-xs text-ink-subtle">
                      {d.mimeType === "application/pdf" ? "PDF" : "JPG"} · {Math.max(1, Math.round(d.bytes / 1024))} KB · {date.format(d.createdAt)}
                    </span>
                  </span>
                  {/* Goes through the reviewer-only route: permission check + audit + 60 s signed URL. */}
                  <a href={`/api/admin/verification-docs/${d.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-brand-700">
                    {t.trust.admin.viewDocument}
                    <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          {r.providerNote && (
            <Card>
              <h2 className="mb-1 text-sm font-semibold">{t.trust.admin.providerNote}</h2>
              <p className="text-sm whitespace-pre-line text-ink-muted">{r.providerNote}</p>
            </Card>
          )}

          {r.status === "SUBMITTED" ? (
            <Card>
              <DecisionForm requestId={r.id} />
            </Card>
          ) : (
            r.decisionNote && (
              <Card>
                <h2 className="mb-1 text-sm font-semibold">{t.trust.admin.decisionNote}</h2>
                <p className="text-sm text-ink-muted">{r.decisionNote}</p>
              </Card>
            )
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">{t.trust.admin.owner}</h2>
            {owner && (
              <>
                <p>{owner.name}</p>
                {owner.phone && <p className="text-ink-muted">{formatPhone(owner.phone)}</p>}
                {owner.email && <p className="break-all text-ink-muted">{owner.email}</p>}
                <p className="mt-1 text-xs text-ink-subtle">{fill(t.trust.admin.memberSince, { date: date.format(owner.createdAt) })}</p>
              </>
            )}
            <Link href={`/p/${r.provider.slug}`} className="mt-3 inline-block font-semibold text-brand-700">
              {t.profile.dashboard.viewProfile}
            </Link>
            {r.provider.verificationLevel && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-xs text-ink-subtle">
                  {t.trust.provider.currentLevel}: {name(r.provider.verificationLevel)}
                </p>
                <RevokeForm providerId={r.provider.id} />
              </div>
            )}
          </Card>

          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">{t.trust.admin.trail}</h2>
            <ol className="flex flex-col gap-2">
              {trail.map((e) => (
                <li key={e.id}>
                  <span className="block font-medium">{e.action.replace("verification.", "")}</span>
                  <span className="text-xs text-ink-subtle">
                    {date.format(e.createdAt)}
                    {e.actor && ` · ${fill(t.trust.admin.by, { name: e.actor.name })}`}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
