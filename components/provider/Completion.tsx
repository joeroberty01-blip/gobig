import Link from "next/link";
import { Check, ChevronRight, Circle } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/dictionaries";
import type { computeCompletion } from "@/lib/provider/completion";

type Completion = ReturnType<typeof computeCompletion>;

export function CompletionBar({ percent, t }: { percent: number; t: Dictionary }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm font-semibold">
        <span>{fill(t.profile.completion.title, { percent })}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Required and optional items, each linking to the screen that fixes it. */
export function CompletionChecklist({ completion, t }: { completion: Completion; t: Dictionary }) {
  const groups = [
    { title: t.profile.completion.required, items: completion.items.filter((i) => i.required) },
    { title: t.profile.completion.optional, items: completion.items.filter((i) => !i.required) },
  ];
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{g.title}</h3>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {g.items.map((i) => (
              <li key={i.key}>
                <Link
                  href={`/provider/setup/${t.profile.completion.itemStep[i.key]}?edit=1`}
                  className="flex min-h-12 items-center gap-3 px-4 text-sm hover:bg-canvas"
                >
                  {i.done ? (
                    <Check aria-hidden className="size-5 shrink-0 text-success" />
                  ) : (
                    <Circle aria-hidden className={`size-5 shrink-0 ${i.required ? "text-accent-500" : "text-line"}`} />
                  )}
                  <span className={`flex-1 ${i.done ? "text-ink-muted" : "font-medium"}`}>{t.profile.completion.items[i.key]}</span>
                  <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
