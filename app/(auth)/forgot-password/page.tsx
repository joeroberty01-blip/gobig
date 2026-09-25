import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/PasswordResetForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.forgotTitle };
}

export default async function ForgotPasswordPage() {
  const { t } = await getServerDictionary();
  return (
    <AuthCard title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
