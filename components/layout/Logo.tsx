/**
 * Go Big mark (owner's reference, 2026-10-01): a bold blue "G" with an orange arrow rising out of
 * it. Solid colours (no gradient ids), so several logos on one page always render.
 */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path d="M35.5 13.5 A15 15 0 1 0 39 26.5 H25" fill="none" stroke="#1f5ff2" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 27 L36 12" fill="none" stroke="#ff9500" strokeWidth="6" strokeLinecap="round" />
      <path d="M28 10.5 H38 V20.5" fill="none" stroke="#ff9500" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The Go Big wordmark (owner: exactly "Go Big"), with the optional tagline under it. */
export function Wordmark({ className = "", tagline }: { className?: string; tagline?: string }) {
  return (
    <span className="flex flex-col leading-none">
      <span className={`font-black tracking-tight whitespace-nowrap ${className}`}>Go Big</span>
      {tagline && <span className="mt-0.5 text-[10px] font-medium tracking-normal whitespace-nowrap opacity-70">{tagline}</span>}
    </span>
  );
}
