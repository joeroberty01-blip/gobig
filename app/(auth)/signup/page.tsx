import Link from "next/link";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.signupTitle };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { t } = await getServerDictionary();
  const role = (await searchParams).role;
  const initialRole = role === "provider" ? "PROVIDER" : role === "customer" ? "CUSTOMER" : null;
  return (
    <AuthCard
      title={t.auth.signupTitle}
      footer={
        <>
          {t.auth.haveAccount}{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            {t.auth.loginTitle}
          </Link>
        </>
      }
    >
      <SignupForm initialRole={initialRole} />
    </AuthCard>
  );
}
