"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, GitCompareArrows, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { COMPARE_EVENT, COMPARE_STORAGE_KEY, compareHref, MAX_COMPARE } from "@/lib/compare";

type Picked = { slug: string; name: string };

// The picked list lives in this browser only (a convenience while choosing); the /compare URL is
// what gets shared. Storage can be unavailable (private mode) — then picking just doesn't persist.
function read(): Picked[] {
  try {
    const v = JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Picked[]).filter((p) => typeof p?.slug === "string" && typeof p?.name === "string").slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}
function write(list: Picked[]) {
  try {
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_COMPARE)));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(COMPARE_EVENT));
}

export function usePicked(): Picked[] {
  const [list, setList] = useState<Picked[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(COMPARE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
}

/** Add/remove a provider from the comparison. `round` sits on a photo; otherwise a small chip. */
export function CompareToggle({ slug, name, round = false }: { slug: string; name: string; round?: boolean }) {
  const { t } = useI18n();
  const picked = usePicked();
  const on = picked.some((p) => p.slug === slug);
  const full = !on && picked.length >= MAX_COMPARE;
  const label = on ? t.ui.compare.remove : full ? fill(t.ui.compare.full, { max: MAX_COMPARE }) : t.ui.compare.add;
  const toggle = () => write(on ? picked.filter((p) => p.slug !== slug) : [...picked, { slug, name }]);
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={full}
      aria-pressed={on}
      aria-label={`${label}: ${name}`}
      title={label}
      className={
        round
          ? `grid size-11 place-items-center rounded-full border shadow-soft backdrop-blur transition active:scale-95 disabled:opacity-50 ${on ? "border-action bg-action text-white" : "border-line bg-surface/90 text-ink"}`
          : `inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${on ? "border-action bg-action text-white" : "border-line bg-surface/90 text-ink-muted hover:text-ink"}`
      }
    >
      {on ? <Check aria-hidden className={round ? "size-5" : "size-3.5"} /> : <GitCompareArrows aria-hidden className={round ? "size-5" : "size-3.5"} />}
      {!round && t.ui.compare.short}
    </button>
  );
}

/** Floating bar while providers are picked: "Compare 2" → /compare. Hidden on the compare page. */
export function CompareBar() {
  const { t } = useI18n();
  const picked = usePicked();
  const pathname = usePathname();
  // Only while browsing providers; never over forms (a request, an account page).
  const browsing = pathname === "/" || ["/search", "/c/", "/categories", "/p/", "/saved", "/ask"].some((p) => pathname.startsWith(p));
  if (!picked.length || !browsing) return null;
  return (
    <>
    {/* Keeps the end of the page reachable above the bar. */}
    <div aria-hidden className={pathname.startsWith("/p/") ? "h-20 md:h-16" : "h-16"} />
    {/* On a profile, phones also show the request bar above the tabs: sit above both. */}
    <div
      className={`fixed inset-x-0 z-30 px-4 lg:bottom-6 ${
        pathname.startsWith("/p/")
          ? "bottom-[calc(9rem+env(safe-area-inset-bottom))] md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
          : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-night-900 p-2 pl-4 text-white shadow-lift animate-rise">
        <GitCompareArrows aria-hidden className="size-5 shrink-0 text-brand-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{picked.map((p) => p.name).join(" · ")}</span>
        <button type="button" onClick={() => write([])} aria-label={t.ui.compare.clear} className="grid size-9 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white">
          <X aria-hidden className="size-4" />
        </button>
        <Link
          href={compareHref(picked.map((p) => p.slug))}
          aria-disabled={picked.length < 2}
          className={`flex min-h-10 items-center rounded-xl px-3.5 text-sm font-bold transition ${picked.length < 2 ? "pointer-events-none bg-white/10 text-white/50" : "bg-brand-500 text-night-900 hover:bg-brand-600"}`}
        >
          {fill(t.ui.compare.go, { count: picked.length })}
        </Link>
      </div>
    </div>
    </>
  );
}

/** On the compare page: keep the browser's list in step with what is shown, and allow removing. */
export function CompareRemove({ slug, slugs }: { slug: string; slugs: string[] }) {
  const { t } = useI18n();
  const rest = slugs.filter((s) => s !== slug);
  return (
    <Link
      href={rest.length ? compareHref(rest) : "/search"}
      onClick={() => write(read().filter((p) => p.slug !== slug))}
      className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-ink-muted hover:bg-canvas hover:text-ink"
    >
      <X aria-hidden className="size-3.5" />
      {t.ui.compare.remove}
    </Link>
  );
}
