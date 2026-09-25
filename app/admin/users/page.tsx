import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { can } from "@/lib/permissions";
import { searchUsers } from "@/lib/services/admin/people";
import { formatPhone } from "@/lib/phone";
import { oneOf, pageParam, Pager, Pill, qs } from "@/components/admin/platform/Bits";
import { ButtonLink, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.users.title };
}

const ROLES = ["CUSTOMER", "PROVIDER", "ADMIN", "SUPER_ADMIN"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED"] as const;
const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageAccess("users:manage", "/admin/users");
  const { t, locale } = await getServerDictionary();
  const u = t.adminPlatform.users;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const role = oneOf(sp.role, ROLES);
  const status = oneOf(sp.status, STATUSES);
  const page = pageParam(sp.page);
  const { rows, pages, total } = await searchUsers({ q, role, status, page });
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={u.title}
        subtitle={fill(t.adminPlatform.common.total, { count: total })}
        action={can(actor, "admins:create") ? <ButtonLink href="/admin/users/new">{u.newAdmin}</ButtonLink> : undefined}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder={u.searchPlaceholder} aria-label={u.searchPlaceholder} maxLength={80} className={`${control} min-w-48 flex-1`} />
        <select name="role" defaultValue={role ?? ""} aria-label={u.role} className={control}>
          <option value="">{t.adminPlatform.common.all}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label={u.status} className={control}>
          <option value="">{t.adminPlatform.common.all}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.admin[`status${s}`]}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white">
          {t.adminPlatform.common.search}
        </button>
      </form>
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted">{t.adminPlatform.common.none}</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/users/${r.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand-500">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{r.name}</span>
                    <Pill value={r.status} label={t.admin[`status${r.status}`]} />
                    <span className="text-xs text-ink-subtle">{t.roles[r.role]}</span>
                  </span>
                  <span className="block truncate text-sm text-ink-muted">{[r.email, r.phone && formatPhone(r.phone)].filter(Boolean).join(" · ")}</span>
                  <span className="block text-xs text-ink-subtle">
                    {u.joined} {date.format(r.createdAt)} · {u.lastLogin} {r.lastLoginAt ? date.format(r.lastLoginAt) : u.never}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={pages} t={t} href={(p) => `/admin/users${qs({ q, role, status, page: p })}`} />
    </div>
  );
}
