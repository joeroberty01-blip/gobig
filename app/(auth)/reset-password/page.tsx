import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetFromLink } from "@/components/auth/PasswordResetForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.auth.resetTitle, referrer: "no-referrer" };
}

// The token arrives in the URL fragment, which the server never sees (SEC-008); the form reads and
// checks it in the browser.
export default async function ResetPasswordPage() {
  const { t } = await getServerDictionary();
  return (
    <AuthCard title={t.auth.resetTitle}>
      <ResetFromLink />
    </AuthCard>
  );
}
