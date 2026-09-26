/** NEXA mark: a navy tile with an "N" whose diagonal is the orange accent. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" fill="#0b1b33" />
      <path d="M10 23V9l12 14V9" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 9l12 14" fill="none" stroke="#f7931e" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The NEXA wordmark: navy letters, the X in orange (as in the brand artwork). */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-[0.12em] ${className}`} aria-label="NEXA">
      <span aria-hidden>
        NE<span className="text-cta">X</span>A
      </span>
    </span>
  );
}
