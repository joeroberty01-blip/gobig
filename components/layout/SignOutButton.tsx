"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui";

export function SignOutButton({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Button type="button" variant="secondary" className={className} onClick={() => signOut({ redirectTo: "/" })}>
      <LogOut aria-hidden className="size-4" />
      {t.nav.logout}
    </Button>
  );
}

/** Unstyled sign-out control for menus and the sidebar. */
export function SignOutLink({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => signOut({ redirectTo: "/" })}>
      {children}
    </button>
  );
}
