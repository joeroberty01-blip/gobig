import type { Metadata } from "next";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { prisma } from "@/lib/db";
import { AwayMode } from "@/components/bookings/AwayMode";
import Link from "next/link";
import { cookies } from "next/headers";
import { BadgeCheck, Bell, ChevronRight, CreditCard, MessageSquareText, UserRound } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { Card, PageHeader } from "@/components/ui";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import { ThemeSwitch } from "@/components/layout/ThemeSwitch";
import { SignOutButton } from "@/components/layout/SignOutButton";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.ui.more.title };
}

/** Phones only in the tab bar: everything that doesn't fit in the four main tabs. */
export default async function ProviderMorePage() {
  const user = await requirePageAccess("provider-area:access", "/provider/more");
  // Phase D: away mode.
  const ownedId = await getOwnedProviderId(user.id);
  const away = ownedId ? await prisma.provider.findUnique({ where: { id: ownedId }, select: { awayUntil: true, awayNote: true } }) : null;
  const [{ t }, jar] = await Promise.all([getServerDictionary(), cookies()]);
  const groups = [
    {
      title: t.ui.more.business,
      links: [
        { href: "/provider/reviews", label: t.nav.reviews, Icon: MessageSquareText },
        { href: "/provider/verification", label: t.nav.verification, Icon: BadgeCheck },
        { href: "/provider/plan", label: t.billing.nav, Icon: CreditCard },
        { href: "/provider/notifications", label: t.requests.notifications.title, Icon: Bell },
      ],
    },
    { title: t.ui.more.account, links: [{ href: "/provider/account", label: t.nav.account, Icon: UserRound }] },
  ];
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t.ui.more.title} />
      <div className="flex flex-col gap-6">
        {away && <AwayMode awayUntil={away.awayUntil?.toISOString() ?? null} awayNote={away.awayNote} />}
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">{g.title}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
              {g.links.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium transition hover:bg-canvas active:bg-canvas">
                    <Icon aria-hidden className="size-5 text-brand-700" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Card className="flex flex-col divide-y divide-line p-0">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <span className="text-sm font-medium">{t.common.language}</span>
            <LanguageSwitch />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="text-sm font-medium">{t.ui.theme.label}</span>
            <ThemeSwitch initial={parseTheme(jar.get(THEME_COOKIE)?.value)} />
          </div>
        </Card>
        <SignOutButton className="w-full" />
      </div>
    </div>
  );
}
