import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/dictionaries";
import { requirePageAccess } from "@/lib/session";
import { twoFactorStatus } from "@/lib/services/twoFactor";
import { RegenerateRecoveryCodes, TwoFactorSetup } from "@/components/admin/platform/TwoFactor";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { Alert, Card, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.security.title };
}

/** Phase 13 (SEC-042): every admin must turn on two-factor and sign in with it. */
export default async function AdminSecurityPage() {
  const user = await requirePageAccess("security:manage-own", "/admin/security");
  const { t, locale } = await getServerDictionary();
  const s = t.security;
  const status = await twoFactorStatus(user.id);
  const date = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title={s.title} subtitle={s.intro} />
      {!status.enabledAt ? (
        <Card>
          <Alert tone="info">{s.required}</Alert>
          <div className="mt-4">
            <TwoFactorSetup />
          </div>
        </Card>
      ) : (
        <>
          <Card className="flex items-start gap-3">
            <ShieldCheck aria-hidden className="size-6 shrink-0 text-success" />
            <div>
              <p className="font-semibold">{fill(s.onSince, { date: date.format(status.enabledAt) })}</p>
              <p className="text-sm text-ink-muted">{fill(s.codesLeft, { count: status.recoveryCodesLeft })}</p>
            </div>
          </Card>
          {user.mfaPending && (
            // Two-factor is on but this session started before it: sign in again with a code.
            <Card className="flex flex-col gap-3">
              <Alert tone="info">{s.signInAgain}</Alert>
              <SignOutButton className="w-full" />
            </Card>
          )}
          {!user.mfaPending && (
            <Card>
              <h2 className="mb-2 font-semibold">{s.regenerate}</h2>
              <RegenerateRecoveryCodes />
            </Card>
          )}
          <p className="text-xs text-ink-subtle">{s.lostDevice}</p>
        </>
      )}
    </div>
  );
}
