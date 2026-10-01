/** Go Big mark: a navy tile with a white "G" whose crossbar is the orange accent. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" fill="#0b1b33" />
      <path d="M21.6 10.6 A7.6 7.6 0 1 0 23.6 16.4" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
      <path d="M23.6 16.4 H17" fill="none" stroke="#f7931e" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The Go Big wordmark: "Go" in the text colour, "Big" in the brand orange (owner: exactly "Go Big"). */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-[0.02em] whitespace-nowrap ${className}`} aria-label="Go Big">
      <span aria-hidden>
        Go <span className="text-cta">Big</span>
      </span>
    </span>
  );
}
