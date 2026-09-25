import Link from "next/link";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";

// Small server-rendered pieces shared by the admin pages (Phase 12).

/** Previous / next links that keep the current filters. */
export function Pager({ page, pages, href, t }: { page: number; pages: number; href: (page: number) => string; t: Dictionary }) {
  if (pages <= 1) return null;
  const c = t.adminPlatform.common;
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label={fill(c.page, { page, pages })}>
      {page > 1 ? (
        <Link href={href(page - 1)} className="min-h-10 px-2 py-2 font-semibold text-brand-700">
          {c.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-ink-muted">{fill(c.page, { page, pages })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className="min-h-10 px-2 py-2 font-semibold text-brand-700">
          {c.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

const TONES: Record<string, string> = {
  ACTIVE: "bg-success-soft text-success",
  SUSPENDED: "bg-danger-soft text-danger",
  OPEN: "bg-brand-50 text-brand-900",
  DRAFT: "bg-canvas text-ink-muted",
};

export function Pill({ value, label }: { value: string; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[value] ?? "bg-canvas text-ink-muted"}`}>{label}</span>;
}

export function pageParam(v: string | string[] | undefined): number {
  const n = Number.parseInt(typeof v === "string" ? v : "1", 10);
  return Number.isFinite(n) && n > 0 && n < 10_000 ? n : 1;
}

export function oneOf<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string | number] => e[1] != null && e[1] !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
}
