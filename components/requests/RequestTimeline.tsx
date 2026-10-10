import { Check } from "lucide-react";
import type { Locale } from "@/lib/i18n/dictionaries";
import { timelineText } from "@/lib/i18n/timeline";
import type { TimelineStep } from "@/lib/requests/timeline";

/** Vertical timeline on the customer's request page (design wave 2: "is anything happening?"). */
export function RequestTimeline({ steps, locale }: { steps: TimelineStep[]; locale: Locale }) {
  const tx = timelineText(locale);
  const time = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });
  return (
    <section aria-labelledby="timeline" className="rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/60 sm:p-5">
      <h2 id="timeline" className="mb-3 text-sm font-semibold text-ink-muted">
        {tx.title}
      </h2>
      <ol className="relative">
        {steps.map((s, i) => {
          const label = tx.steps[s.key][s.state].replace("{n}", String(s.count ?? 0));
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && <span aria-hidden className={`absolute top-6 left-[11px] h-[calc(100%-1.25rem)] w-0.5 ${s.state === "done" ? "bg-action/40" : "bg-line"}`} />}
              <span
                aria-hidden
                className={`relative grid size-6 shrink-0 place-items-center rounded-full ${
                  s.state === "done"
                    ? s.key === "cancelled" || s.key === "expired"
                      ? "bg-ink-subtle text-white"
                      : "bg-action text-white"
                    : s.state === "current"
                      ? "bg-surface ring-2 ring-cta"
                      : "bg-surface ring-1 ring-line"
                }`}
              >
                {s.state === "done" && <Check className="size-3.5" strokeWidth={3} />}
                {s.state === "current" && <span className="size-2 animate-pulse rounded-full bg-cta motion-reduce:animate-none" />}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className={`block text-sm ${s.state === "todo" ? "text-ink-subtle" : s.state === "current" ? "font-semibold text-ink" : "text-ink"}`}>{label}</span>
                {s.state === "done" && s.at && <span className="block text-xs text-ink-subtle">{time.format(s.at)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
