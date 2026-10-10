import { Bot, Sparkles } from "lucide-react";
import { OpenAiChat } from "./OpenAiChat";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** "Need help deciding?" — owner's mockup (2026-10-06): sends people to Go Big AI. */
export function AiPromo({ t }: { t: Dictionary }) {
  const h = t.ui.home;
  return (
    <section className="mt-8 flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-[#eaf1ff] to-[#f4f0ff] p-5 ring-1 ring-action/10 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <div className="flex items-center gap-4 sm:flex-1">
        {/* A phone with the assistant on it, drawn from icons (no stock art). */}
        <span aria-hidden className="relative grid h-20 w-14 shrink-0 -rotate-6 place-items-center rounded-2xl border-[3px] border-ink bg-surface shadow-soft">
          <span className="grid size-9 place-items-center rounded-xl bg-ink text-white">
            <Bot className="size-5" />
          </span>
          <Sparkles className="absolute -top-3 -left-4 size-5 text-action" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{h.aiPromoTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{h.aiPromoBody}</p>
        </div>
      </div>
      <OpenAiChat
        label={h.aiPromoCta}
        className="inline-flex min-h-12 items-center justify-center gap-2 self-stretch rounded-2xl bg-action px-6 text-sm font-semibold text-white shadow-soft transition hover:bg-action-hover active:scale-[0.98] sm:self-auto"
      />
    </section>
  );
}
