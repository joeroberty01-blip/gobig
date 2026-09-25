import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { auditLog } from "@/lib/services/admin/insights";
import { pageParam, Pager, qs } from "@/components/admin/platform/Bits";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.audit.title };
}

const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base";

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("audit:view", "/admin/audit");
  const { t, locale } = await getServerDictionary();
  const a = t.adminPlatform.audit;
  const sp = await searchParams;
  const action = typeof sp.action === "string" && /^[a-z._]{1,60}$/.test(sp.action) ? sp.action : null;
  const entity = typeof sp.entity === "string" && /^[A-Za-z]{1,40}$/.test(sp.entity) ? sp.entity : null;
  const actorId = typeof sp.actor === "string" && /^[a-z0-9]{10,40}$/i.test(sp.actor) ? sp.actor : null;
  const page = pageParam(sp.page);
  const { rows, pages, total, entityTypes } = await auditLog({ action, entityType: entity, actorId, page });
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={a.title} subtitle={a.intro} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="action" defaultValue={action ?? ""} placeholder={a.action} aria-label={a.action} maxLength={60} className={`${control} min-w-40`} />
        <select name="entity" defaultValue={entity ?? ""} aria-label={a.entity} className={control}>
          <option value="">{t.adminPlatform.common.all}</option>
          {entityTypes.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        {actorId && <input type="hidden" name="actor" value={actorId} />}
        <button type="submit" className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white">
          {t.adminPlatform.common.search}
        </button>
        <span className="self-center text-sm text-ink-subtle">{fill(t.adminPlatform.common.total, { count: total })}</span>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-ink-subtle">
            <tr className="border-b border-line">
              <th className="p-3 font-normal">{a.when}</th>
              <th className="p-3 font-normal">{a.who}</th>
              <th className="p-3 font-normal">{a.what}</th>
              <th className="p-3 font-normal">{a.details}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="p-3 whitespace-nowrap text-ink-muted tabular-nums">{date.format(r.createdAt)}</td>
                <td className="p-3">
                  {r.actor ? (
                    <a href={`/admin/audit${qs({ actor: r.actor.id })}`} className="underline">
                      {r.actor.name}
                    </a>
                  ) : (
                    <span className="text-ink-subtle">{a.system}</span>
                  )}
                </td>
                <td className="p-3">
                  <span className="font-mono text-xs">{r.action}</span>
                  <span className="block text-xs text-ink-subtle">
                    {r.entityType} · {r.entityId.slice(0, 10)}…
                  </span>
                </td>
                <td className="max-w-md p-3">
                  {/* Metadata is ids and short notes only (no secrets, by policy) — shown as plain text. */}
                  <code className="line-clamp-3 text-xs break-all text-ink-muted">{r.metadata ? JSON.stringify(r.metadata) : ""}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pager page={page} pages={pages} t={t} href={(n) => `/admin/audit${qs({ action, entity, actor: actorId, page: n })}`} />
    </div>
  );
}
