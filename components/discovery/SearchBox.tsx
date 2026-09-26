import { ArrowRight, Search } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Plain GET form to /search — works before any JavaScript loads (slow connections), and the
 * result URL is shareable. Hidden fields keep the current filters when the text changes.
 */
export function SearchBox({
  t,
  defaultValue = "",
  keep = {},
  autoFocus = false,
  size = "md",
}: {
  t: Dictionary;
  defaultValue?: string;
  keep?: Record<string, string | null | undefined>;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <form action="/search" method="get" role="search" className="relative">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search aria-hidden className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ${lg ? "left-5 size-5.5" : "left-4 size-5"}`} />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={t.discovery.searchPlaceholder}
        aria-label={t.discovery.searchPlaceholder}
        autoFocus={autoFocus}
        maxLength={100}
        enterKeyHint="search"
        className={`block w-full rounded-2xl border border-line bg-surface text-base text-ink shadow-soft transition placeholder:text-ink-subtle focus:border-brand-500 focus:outline-2 focus:outline-brand-500/40 ${
          lg ? "min-h-15 pr-16 pl-13 sm:text-lg" : "min-h-13 pr-14 pl-12"
        }`}
      />
      <button
        type="submit"
        aria-label={t.discovery.search}
        className={`absolute top-1/2 right-2 grid -translate-y-1/2 place-items-center rounded-xl bg-night-900 text-white transition hover:bg-night-700 active:scale-95 ${lg ? "size-11" : "size-10"}`}
      >
        <ArrowRight aria-hidden className="size-5" />
      </button>
    </form>
  );
}
