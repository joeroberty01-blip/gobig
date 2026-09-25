"use client";

import { useState } from "react";

/**
 * One measure, day by day: thin columns from a single baseline, one hue, no legend (the title names
 * the series). Hovering or tapping a day shows its value in the readout line; the full numbers are
 * also in the table view on the page. Each chart has its own scale — the measures differ by orders
 * of magnitude, so they're small multiples rather than one chart with two axes.
 */
export function DailyBars({ title, days, values, locale }: { title: string; days: string[]; values: number[]; locale: "sw" | "en" }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const fmt = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const shown = active ?? values.length - 1;

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium text-ink">{title}</span>
        <span className="text-ink-muted tabular-nums" aria-live="polite">
          {fmt.format(new Date(days[shown]!))}: <strong className="font-semibold text-ink">{values[shown]!.toLocaleString("en-US")}</strong>
          <span className="text-ink-subtle"> · Σ {total.toLocaleString("en-US")}</span>
        </span>
      </figcaption>
      <div
        role="img"
        aria-label={`${title}: ${total.toLocaleString("en-US")}`}
        className="flex h-24 items-end gap-[2px] border-b border-line"
        onPointerLeave={() => setActive(null)}
      >
        {values.map((v, i) => (
          // The whole column is the hit target (bigger than the bar); the bar is ≤ 24px wide.
          <div
            key={i}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
          >
            {v > 0 && (
              <div
                className={`w-full max-w-6 rounded-t-[4px] ${i === active ? "bg-brand-900" : "bg-brand-500"}`}
                style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-ink-subtle">
        <span>{fmt.format(new Date(days[0]!))}</span>
        <span>{fmt.format(new Date(days[days.length - 1]!))}</span>
      </div>
    </figure>
  );
}
