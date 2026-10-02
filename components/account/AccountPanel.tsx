import Link from "next/link";
import { cookies } from "next/headers";
import { Bell, ChevronRight, CircleHelp, Info, MapPin, ShieldCheck, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { formatPhone } from "@/lib/phone";
import type { CurrentUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { ThemeSwitch } from "@/components/layout/ThemeSwitch";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { getSavedArea, getSavedPoint } from "@/lib/discovery/area";
import { getAreaPickerOptions } from "@/lib/data/discovery";
import { DeleteAccount, ForgetLocation, NameForm, PasswordForm, SignOutEverywhere } from "@/components/settings/SettingsForms";

/**
 * Settings (owner, 2026-10-01): one page for every role, inside each area's own shell — profile,
 * preferences, location, notifications, security, help, and (customers) deleting the account.
 */
export async function AccountPanel({ user }: { user: CurrentUser }) {
  const [{ t, locale }, platform, jar, areaSlug, point] = await Promise.all([getServerDictionary(), getPlatformSettings(), cookies(), getSavedArea(), getSavedPoint()]);
  const s = t.settings;
  const admin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const areaName = !point && areaSlug ? ((await getAreaPickerOptions()).flatMap((d) => d.children).find((a) => a.slug === areaSlug)?.name ?? null) : null;
  const support = [platform.supportPhone, platform.supportWhatsapp && `WhatsApp ${platform.supportWhatsapp}`, platform.supportEmail].filter(Boolean);
  const joined = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "long" }).format(user.createdAt);
  const notificationsHref = user.role === "PROVIDER" ? "/provider/account/notifications" : admin ? null : "/account/notifications";
  const rows: [string, string][] = [
    [t.account.phone, user.phone ? formatPhone(user.phone) : t.common.none],
    [t.account.email, user.email ?? t.common.none],
    [t.account.role, t.roles[user.role]],
    [t.account.memberSince, joined],
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={s.title} subtitle={s.intro} />

      <Section icon={UserRound} title={s.profile}>
        <div className="mb-3 flex items-center gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-action text-xl font-black text-white shadow-soft">
            {user.name.trim().slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <NameForm name={user.name} />
          </div>
        </div>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-right font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-subtle">{s.contactNote}</p>
      </Section>

      <Section icon={SlidersHorizontal} title={s.preferences} flush>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-sm font-medium">{t.common.language}</span>
          <LanguageSwitch />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <span className="text-sm font-medium">{t.ui.theme.label}</span>
          <ThemeSwitch initial={parseTheme(jar.get(THEME_COOKIE)?.value)} />
        </div>
      </Section>

      {!admin && (
        <Section icon={MapPin} title={s.location}>
          <p className="text-sm font-medium">{point ? s.locationShared : areaName ? fill(s.locationArea, { area: areaName }) : s.locationNone}</p>
          <p className="mt-1 text-xs text-ink-subtle">{s.locationHint}</p>
          {(point || areaName) && (
            <div className="mt-3">
              <ForgetLocation />
            </div>
          )}
        </Section>
      )}

      {notificationsHref && <LinkRow href={notificationsHref} icon={Bell} title={s.notifications} hint={s.notificationsHint} />}

      <Section icon={ShieldCheck} title={s.security}>
        <div className="flex flex-col items-start gap-4">
          <PasswordForm />
          {admin && (
            <Link href="/admin/security" className="flex items-center gap-1 text-sm font-semibold text-action">
              {t.security.title}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          )}
          <SignOutEverywhere />
          <SignOutButton />
        </div>
      </Section>

      <Section icon={CircleHelp} title={s.help} flush>
        <Row href="/help" label={s.helpCenter} icon={CircleHelp} />
        <Row href="/about" label={s.about} icon={Info} border />
        {support.length > 0 && (
          <div className="border-t border-line px-5 py-4 text-sm">
            <p className="font-medium">{t.account.support}</p>
            <p className="mt-1 text-ink-muted">{support.join(" · ")}</p>
          </div>
        )}
      </Section>

      {!admin && (
        <Section icon={Trash2} title={s.dangerZone} tone="danger">
          <p className="mb-3 text-sm text-ink-muted">{user.role === "CUSTOMER" ? s.deleteHint : s.deleteNotCustomer}</p>
          {user.role === "CUSTOMER" && <DeleteAccount />}
        </Section>
      )}
    </div>
  );
}

type IconT = React.ComponentType<{ className?: string }>;

function Section({ icon: Icon, title, children, flush, tone }: { icon: IconT; title: string; children: React.ReactNode; flush?: boolean; tone?: "danger" }) {
  return (
    <section className="mt-5">
      <h2 className={`mb-2 flex items-center gap-2 px-1 text-xs font-semibold tracking-wide uppercase ${tone === "danger" ? "text-danger" : "text-ink-subtle"}`}>
        <Icon className="size-4" />
        {title}
      </h2>
      <Card className={flush ? "p-0" : ""}>{children}</Card>
    </section>
  );
}

function LinkRow({ href, icon: Icon, title, hint }: { href: string; icon: IconT; title: string; hint: string }) {
  return (
    <Link href={href} className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-5 shadow-soft transition hover:shadow-lift">
      <span className="grid size-10 place-items-center rounded-full bg-action/10 text-action">
        <Icon className="size-5" />
      </span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 text-ink-subtle" />
    </Link>
  );
}

function Row({ href, label, icon: Icon, border }: { href: string; label: string; icon: IconT; border?: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-5 py-4 text-sm font-medium transition hover:bg-canvas ${border ? "border-t border-line" : ""}`}>
      <Icon className="size-4 text-ink-subtle" />
      <span className="flex-1">{label}</span>
      <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
    </Link>
  );
}
