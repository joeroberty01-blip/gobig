"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { usePicked } from "@/components/discovery/Compare";

// Floating "Ask NEXA" chat button (owner's request, 2026-09-26). Only on browsing pages: never over
// a form, a profile's request bar, or Ask NEXA itself; it steps aside while the compare bar is up.
const EXACT = ["/", "/requests", "/saved", "/notifications", "/categories"];
const PREFIX = ["/search", "/c/"];

export function AskFab() {
  const { t } = useI18n();
  const pathname = usePathname();
  const picked = usePicked();
  const show = (EXACT.includes(pathname) || PREFIX.some((p) => pathname.startsWith(p))) && !picked.length;
  if (!show) return null;
  return (
    <Link
      href="/ask"
      aria-label={t.ai.title}
      className="group fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-full nav-gradient p-3.5 text-white shadow-lift ring-4 ring-white/70 transition hover:-translate-y-0.5 active:scale-95 md:right-6 md:bottom-6 md:py-3 md:pr-5 md:pl-4 dark:ring-white/10"
    >
      <span aria-hidden className="absolute top-0.5 right-0.5 size-3 rounded-full bg-whatsapp ring-2 ring-white md:top-1 md:right-1" />
      <Sparkles aria-hidden className="size-6 text-cta md:size-5" />
      <span className="hidden text-sm font-bold md:inline">{t.ai.title}</span>
    </Link>
  );
}
