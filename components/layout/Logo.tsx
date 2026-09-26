/** GO BIG mark: a map pin that is also an upward arrow — local, and going places. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      
      {/* Solid fill: a gradient id would break when another copy sits in a hidden sidebar. */}
      <rect width="32" height="32" rx="9" fill="#10a37a" />
      <path d="M16 6.5c-4.3 0-7.5 3.2-7.5 7.3 0 5.1 5.6 10.4 6.9 11.6a.9.9 0 0 0 1.2 0c1.3-1.2 6.9-6.5 6.9-11.6 0-4.1-3.2-7.3-7.5-7.3Z" fill="#fff" />
      <path d="m12.6 15.4 3.4-3.4 3.4 3.4" fill="none" stroke="#0a6e53" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
