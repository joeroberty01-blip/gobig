"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { SideNav, type NavItem } from "./NavLinks";
import { Wordmark } from "./Logo";
import { SignOutLink } from "./SignOutButton";

/**
 * Phones: the ☰ button in the header opens the same navy sidebar as a slide-in panel, so every
 * section is one tap away (the bottom tabs stay for the main five).
 */
export function MobileDrawer({ items, homeHref, userName, hideFrom = "md" }: { items: NavItem[]; homeHref: string; userName: string | null; hideFrom?: "md" | "lg" }) {
  // Static class names (Tailwind must see them whole): the drawer hides where the desktop menu shows.
  const hide = hideFrom === "lg" ? "lg:hidden" : "md:hidden";
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating, and with Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.ui.nav.menu}
        aria-expanded={open}
        className={`grid size-10 shrink-0 place-items-center rounded-xl text-ink transition hover:bg-canvas ${hide}`}
      >
        <Menu aria-hidden className="size-5.5" />
      </button>
      {/* Rendered on <body>: the header's backdrop blur would otherwise trap a fixed panel inside it. */}
      {open &&
        createPortal(
        <div className={`fixed inset-0 z-50 ${hide}`} role="dialog" aria-modal="true" aria-label={t.ui.nav.menu}>
          <button type="button" aria-label={t.ui.nav.close} onClick={() => setOpen(false)} className="absolute inset-0 bg-night-900/50 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col nav-gradient px-3 py-5 text-white shadow-lift animate-rise">
            <div className="mb-6 flex items-center justify-between px-3">
              <Link href={homeHref} className="flex items-center gap-2.5">
                <Wordmark className="text-xl" />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.ui.nav.close} className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <SideNav items={items} />
            </div>
            {userName && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="truncate px-3 text-sm font-semibold">{userName}</p>
                <SignOutLink className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-white/65 hover:bg-white/5 hover:text-white">
                  <LogOut aria-hidden className="size-4.5" />
                  {t.nav.logout}
                </SignOutLink>
              </div>
            )}
          </aside>
        </div>,
          document.body,
        )}
    </>
  );
}
