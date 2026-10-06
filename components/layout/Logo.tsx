/**
 * Go Big brand (owner, 2026-10-06): a bold white "G" with an orange arrow launching out of its
 * opening, on a blue→indigo tile. The same drawing as scripts/brand/icons.ts (app icons, store art).
 *
 * The gradients live once in <BrandDefs /> (root layout), always rendered, so a logo inside a hidden
 * menu or several logos on one page never lose their colours.
 */
export function BrandDefs() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute" focusable="false">
      <defs>
        <linearGradient id="gb-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#3a1fc9" />
        </linearGradient>
        <linearGradient id="gb-spark" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff7a00" />
          <stop offset="1" stopColor="#ffc21a" />
        </linearGradient>
        <radialGradient id="gb-glow" cx="0.3" cy="0.2" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={`shrink-0 drop-shadow-[0_4px_10px_rgba(58,31,201,0.25)] ${className}`}>
      <rect width="64" height="64" rx="18" fill="url(#gb-tile)" />
      <rect width="64" height="64" rx="18" fill="url(#gb-glow)" />
      <path d="M40.5 21.2 A15.5 15.5 0 1 0 45.5 35 H33" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M41.5 22.5 L51 13" fill="none" stroke="url(#gb-spark)" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M43.5 12 H52 V20.5" fill="none" stroke="url(#gb-spark)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The wordmark (owner: exactly "Go Big"): "Big" in the arrow's orange, with the optional tagline. */
export function Wordmark({ className = "", tagline }: { className?: string; tagline?: string }) {
  return (
    <span className="flex flex-col leading-none">
      <span className={`font-black tracking-tight whitespace-nowrap ${className}`}>
        Go <span className="bg-gradient-to-r from-[#ffb000] to-[#ff6a00] bg-clip-text pr-0.5 text-transparent">Big</span>
      </span>
      {tagline && <span className="mt-0.5 text-[10px] font-medium tracking-normal whitespace-nowrap opacity-70">{tagline}</span>}
    </span>
  );
}
