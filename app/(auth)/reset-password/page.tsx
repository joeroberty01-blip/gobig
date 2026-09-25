import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { isResetTokenValid } from "@/lib/services/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";
import { Alert, ButtonLink } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.resetTitle, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getServerDictionary();
  const token = (await searchParams).token ?? "";
  const valid = token.length >= 20 && token.length <= 200 && (await isResetTokenValid(token));

  return (
    <AuthCard title={t.auth.resetTitle}>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert>{t.auth.resetLinkInvalid}</Alert>
          <ButtonLink href="/forgot-password">{t.auth.requestNewLink}</ButtonLink>
        </div>
      )}
    </AuthCard>
  );
}
