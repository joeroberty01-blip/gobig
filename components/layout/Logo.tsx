/**
 * Go Big wordmark (owner, 2026-10-06: "just words", no icon): "Go" in the text colour and "Big" in
 * the brand orange gradient, with the optional tagline under it. App icons and store images are drawn
 * from the same words by scripts/brand/icons.ts.
 */
export function Wordmark({ className = "", tagline }: { className?: string; tagline?: string }) {
  return (
    <span className="flex flex-col leading-none">
      <span className={`font-[800] tracking-[-0.03em] whitespace-nowrap ${className}`}>
        Go <span className="bg-gradient-to-r from-[#ffb000] to-[#ff6a00] bg-clip-text pr-0.5 text-transparent">Big</span>
      </span>
      {tagline && <span className="mt-1 block max-w-[9rem] text-[9px] leading-tight font-medium tracking-normal opacity-70 sm:max-w-none sm:text-[10px] sm:whitespace-nowrap">{tagline}</span>}
    </span>
  );
}
