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
  action = "/search",
  placeholder,
}: {
  t: Dictionary;
  defaultValue?: string;
  keep?: Record<string, string | null | undefined>;
  autoFocus?: boolean;
  size?: "md" | "lg";
  /** "/ask" sends the text to the AI search (home), "/search" is the plain search. */
  action?: "/search" | "/ask";
  placeholder?: string;
}) {
  const lg = size === "lg";
  return (
    <form action={action} method="get" role="search" className="relative">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search aria-hidden className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ${lg ? "left-4 size-4.5 sm:left-5 sm:size-5.5" : "left-4 size-5"}`} />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder ?? t.discovery.searchPlaceholder}
        aria-label={placeholder ?? t.discovery.searchPlaceholder}
        autoFocus={autoFocus}
        maxLength={100}
        enterKeyHint="search"
        className={`block w-full rounded-2xl border border-transparent bg-surface text-base text-ink shadow-soft transition placeholder:text-ink-subtle focus:border-brand-500 focus:outline-2 focus:outline-brand-500/40 ${
          lg ? "min-h-12 pr-14 pl-11 text-sm sm:min-h-15 sm:pr-16 sm:pl-13 sm:text-lg" : "min-h-12 pr-14 pl-12"
        }`}
      />
      <button
        type="submit"
        aria-label={t.discovery.search}
        className={`absolute top-1/2 right-2 grid -translate-y-1/2 place-items-center rounded-full bg-action text-white transition hover:bg-action-hover active:scale-95 ${lg ? "size-9 sm:size-11" : "size-9"}`}
      >
        <ArrowRight aria-hidden className="size-5" />
      </button>
    </form>
  );
}
