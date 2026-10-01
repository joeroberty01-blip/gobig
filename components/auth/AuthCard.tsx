import Link from "next/link";
import { BadgeCheck, LocateFixed, Star } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import { Logo, Wordmark } from "@/components/layout/Logo";

/**
 * Frame for login / sign-up / password reset (Phase 14): the form alone on phones; on large
 * screens a brand panel beside it stating what GO BIG actually guarantees.
 */
export async function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = await getServerDictionary();
  const a = t.ui.auth;
  return (
    <div className="flex min-h-dvh">
      <aside className="nav-gradient relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="size-9" />
          <Wordmark className="text-xl" />
        </Link>
        <div>
          <p className="text-4xl leading-tight font-extrabold tracking-tight text-balance">{a.panelTitle}</p>
          <ul className="mt-8 flex flex-col gap-4 text-white/80">
            {[
              [BadgeCheck, a.point1],
              [Star, a.point2],
              [LocateFixed, a.point3],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof BadgeCheck;
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
                    <I aria-hidden className="size-4.5 text-brand-500" />
                  </span>
                  <span className="pt-1.5">{text as string}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-sm text-white/45">{t.app.tagline}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4 lg:max-w-lg">
          <Link href="/" className="flex items-center gap-2 lg:invisible">
            <Logo className="size-8" />
            <Wordmark className="text-lg" />
          </Link>
          <LanguageSwitch />
        </header>
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-10 lg:flex lg:max-w-lg lg:flex-col lg:justify-center lg:pb-24">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-lift animate-rise sm:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </main>
      </div>
    </div>
  );
}
