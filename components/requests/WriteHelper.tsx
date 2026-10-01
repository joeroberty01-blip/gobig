"use client";

import { useState, useTransition } from "react";
import { HelpCircle, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Alert, Button } from "@/components/ui";
import { assistRequestAction } from "@/lib/actions/requestAssist";
import type { MissingCode } from "@/lib/ai/assist";

/**
 * Automation Engine, Phase E: "Help me write". Shows a clearer version of the customer's own words
 * and the details businesses usually ask for. Nothing changes until the customer taps "Use this".
 */
export function WriteHelper({ text, serviceId, onUse }: { text: string; serviceId: string; onUse: (next: string) => void }) {
  const { t } = useI18n();
  const a = t.ai.assist;
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ suggestion: string; rewritten: boolean; missing: MissingCode[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await assistRequestAction(text, serviceId || null);
      if (!r.ok) {
        setResult(null);
        return setError(a.errors[r.error]);
      }
      setResult({ suggestion: r.suggestion, rewritten: r.rewritten, missing: r.missing });
    });

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" onClick={ask} disabled={pending || text.trim().length < 10} className="min-h-9 w-fit gap-1.5">
        <Sparkles aria-hidden className="size-4 text-cta" />
        {pending ? a.working : a.button}
      </Button>
      {error && <Alert>{error}</Alert>}
      {result && (
        <div className="rounded-2xl border border-link/25 p-3.5" style={{ background: "color-mix(in oklab, var(--color-link) 6%, var(--color-surface))" }}>
          {result.rewritten ? (
            <>
              <p className="text-xs font-semibold text-link">{a.title}</p>
              <p className="mt-1 text-sm whitespace-pre-line text-ink">{result.suggestion}</p>
              <p className="mt-1 text-[11px] text-ink-subtle">{a.aiNote}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="cta"
                  className="min-h-9"
                  onClick={() => {
                    onUse(result.suggestion);
                    setResult({ ...result, rewritten: false });
                  }}
                >
                  {a.use}
                </Button>
                <Button type="button" variant="ghost" className="min-h-9" onClick={() => setResult({ ...result, rewritten: false })}>
                  {a.keep}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">{a.unchanged}</p>
          )}
          {result.missing.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">{a.missingTitle}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {result.missing.map((m) => (
                  <li key={m} className="flex items-start gap-1.5 text-sm">
                    <HelpCircle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-link" />
                    {a.questions[m]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
