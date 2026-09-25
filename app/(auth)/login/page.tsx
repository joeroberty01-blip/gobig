import Link from "next/link";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { safeCallbackPath } from "@/lib/roles";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.loginTitle };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { t } = await getServerDictionary();
  const callbackUrl = safeCallbackPath((await searchParams).callbackUrl);
  return (
    <AuthCard
      title={t.auth.loginTitle}
      subtitle={callbackUrl ? t.auth.loginToContinue : t.auth.loginSubtitle}
      footer={
        <>
          {t.auth.noAccount}{" "}
          <Link href="/signup" className="font-semibold text-brand-700 hover:underline">
            {t.auth.createAccount}
          </Link>
        </>
      }
    >
      <LoginForm callbackUrl={callbackUrl} />
    </AuthCard>
  );
}
