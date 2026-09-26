import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { userDetail } from "@/lib/services/admin/people";
import { formatPhone } from "@/lib/phone";
import { Pill } from "@/components/admin/platform/Bits";
import { ReasonAction } from "@/components/admin/platform/Controls";
import { Card } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.adminPlatform.users.detail };
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageAccess("users:manage", `/admin/users/${id}`);
  const user = await userDetail(id);
  if (!user) notFound();
  const { t, locale } = await getServerDictionary();
  const u = t.adminPlatform.users;
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  // Mirrors the service rule (it re-checks): not yourself; admins only by a super admin.
  const canChange = actor.id !== user.id && (!(user.role === "ADMIN" || user.role === "SUPER_ADMIN") || actor.role === "SUPER_ADMIN");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/admin/users" className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {u.title}
      </Link>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{user.name}</h1>
          <Pill value={user.status} label={t.admin[`status${user.status}`]} />
          <span className="text-sm text-ink-muted">{t.roles[user.role]}</span>
        </div>
        <p className="text-sm text-ink-muted">{[user.email, user.phone && formatPhone(user.phone)].filter(Boolean).join(" · ")}</p>
        <p className="text-xs text-ink-subtle">
          {u.joined} {date.format(user.createdAt)} · {u.lastLogin} {user.lastLoginAt ? date.format(user.lastLoginAt) : u.never}
        </p>
        <p className="text-sm">
          {fill(u.counts, { requests: user._count.serviceRequests, reviews: user._count.reviews, reports: user._count.reportsFiled, saved: user._count.favorites })}
        </p>
        {actor.role === "SUPER_ADMIN" && actor.id !== user.id && user.totpEnabledAt && (
          <div className="mt-2">
            <ReasonAction action={{ kind: "resetTwoFactor", id: user.id }} label={t.security.reset} hint={t.security.resetHint} danger />
          </div>
        )}
        {canChange && (
          <div className="mt-2">
            {user.status === "ACTIVE" ? (
              <ReasonAction action={{ kind: "suspendUser", id: user.id }} label={u.suspend} hint={u.suspendHint} danger />
            ) : (
              <ReasonAction action={{ kind: "reactivateUser", id: user.id }} label={u.reactivate} />
            )}
          </div>
        )}
      </Card>

      {user.memberships.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">{u.businesses}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {user.memberships.map((m) => (
              <li key={m.provider.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/providers?q=${encodeURIComponent(m.provider.slug)}`} className="font-semibold hover:underline">
                  {m.provider.profile?.displayName ?? m.provider.slug}
                </Link>
                <Pill value={m.provider.status} label={t.adminPlatform.providers[`status${m.provider.status}`]} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">{u.history}</h2>
        {user.history.length === 0 ? (
          <p className="text-sm text-ink-muted">{u.noHistory}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {user.history.map((h, i) => (
              <li key={i}>
                <span className="text-ink-subtle">{date.format(h.createdAt)}</span> · {h.action}
                {typeof (h.metadata as { reason?: string } | null)?.reason === "string" && <span className="text-ink-muted"> — {(h.metadata as { reason: string }).reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
