import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";

/** Centered, distraction-free frame for login / sign-up / password reset. */
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
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        <Link href="/" className="text-lg font-black tracking-tight text-brand-700">
          {t.app.name}
        </Link>
        <LanguageSwitch />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-10">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
      </main>
    </div>
  );
}
