import { Search } from "lucide-react";
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
}: {
  t: Dictionary;
  defaultValue?: string;
  keep?: Record<string, string | null | undefined>;
  autoFocus?: boolean;
}) {
  return (
    <form action="/search" method="get" role="search" className="relative">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={t.discovery.searchPlaceholder}
        aria-label={t.discovery.searchPlaceholder}
        autoFocus={autoFocus}
        maxLength={100}
        enterKeyHint="search"
        className="block min-h-13 w-full rounded-2xl border border-line bg-surface pr-24 pl-12 text-base shadow-sm focus:outline-2 focus:outline-brand-500"
      />
      <button type="submit" className="absolute top-1/2 right-2 min-h-10 -translate-y-1/2 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white">
        {t.discovery.search}
      </button>
    </form>
  );
}
