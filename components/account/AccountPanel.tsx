import { getServerDictionary } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import type { CurrentUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { getPlatformSettings } from "@/lib/services/platformSettings";
import { cookies } from "next/headers";
import { ThemeSwitch } from "@/components/layout/ThemeSwitch";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

/** The same account page for every role; each area renders it inside its own shell. */
export async function AccountPanel({ user }: { user: CurrentUser }) {
  const [{ t, locale }, platform, jar] = await Promise.all([getServerDictionary(), getPlatformSettings(), cookies()]);
  const support = [platform.supportPhone, platform.supportWhatsapp && `WhatsApp ${platform.supportWhatsapp}`, platform.supportEmail].filter(Boolean);
  const joined = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "long" }).format(user.createdAt);
  const rows: [string, string][] = [
    [t.account.name, user.name],
    [t.account.phone, user.phone ? formatPhone(user.phone) : t.common.none],
    [t.account.email, user.email ?? t.common.none],
    [t.account.role, t.roles[user.role]],
    [t.account.memberSince, joined],
  ];

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t.account.title} />
      <div className="mb-4 flex items-center gap-4">
        <span aria-hidden className="grid size-16 place-items-center rounded-full bg-hero text-2xl font-black text-white shadow-soft">
          {user.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{user.name}</p>
          <p className="text-sm text-ink-muted">{t.roles[user.role]}</p>
        </div>
      </div>
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">{t.account.profile}</h2>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-right font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="mt-4 flex flex-col divide-y divide-line p-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-sm font-medium">{t.common.language}</span>
          <LanguageSwitch />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="text-sm font-medium">{t.ui.theme.label}</span>
          <ThemeSwitch initial={parseTheme(jar.get(THEME_COOKIE)?.value)} />
        </div>
      </Card>
      {support.length > 0 && (
        <Card className="mt-4 text-sm">
          <p className="font-medium">{t.account.support}</p>
          <p className="mt-1 text-ink-muted">{support.join(" · ")}</p>
        </Card>
      )}
      <SignOutButton className="mt-6 w-full" />
    </div>
  );
}
