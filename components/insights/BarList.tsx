/**
 * Magnitude by category: horizontal bars from one baseline, one hue, sorted largest first, the
 * value as text beside each bar (text in ink, never in the bar colour). Server-rendered.
 */
export function BarList({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (!sorted.length) return <p className="text-sm text-ink-muted">{empty}</p>;
  const max = sorted[0]!.value;
  const total = sorted.reduce((a, r) => a + r.value, 0);
  return (
    <ul className="flex flex-col gap-2.5">
      {sorted.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
          <span className="truncate text-ink-muted" title={r.label}>
            {r.label}
          </span>
          <span className="h-3 rounded-r-[4px] bg-brand-500" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} aria-hidden />
          <span className="text-right tabular-nums">
            <strong className="font-semibold text-ink">{r.value.toLocaleString("en-US")}</strong>{" "}
            <span className="text-xs text-ink-subtle">{Math.round((r.value / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
