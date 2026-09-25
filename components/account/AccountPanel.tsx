import { getServerDictionary } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import type { CurrentUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { getPlatformSettings } from "@/lib/services/platformSettings";

/** The same account page for every role; each area renders it inside its own shell. */
export async function AccountPanel({ user }: { user: CurrentUser }) {
  const [{ t, locale }, platform] = await Promise.all([getServerDictionary(), getPlatformSettings()]);
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
      <Card className="mt-4 flex items-center justify-between">
        <span className="text-sm font-medium">{t.common.language}</span>
        <LanguageSwitch />
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
