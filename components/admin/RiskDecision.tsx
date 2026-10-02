"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { resolveRiskFlagAction } from "@/lib/actions/risk";

/** Close a risk flag with a note: "handled" or "dismissed". Strings come from the server page. */
export function RiskDecision({ id, text }: { id: string; text: { note: string; noteHint: string; handled: string; dismiss: string; error: string } }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const run = (outcome: "ACTIONED" | "DISMISSED") =>
    start(async () => {
      const r = await resolveRiskFlagAction({ id, outcome, note });
      setError(!r.ok);
      if (r.ok) router.refresh();
    });
  const ready = note.trim().length >= 3 && !pending;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <label htmlFor={`risk-${id}`} className="text-xs font-medium text-ink-muted">
        {text.note}
      </label>
      <textarea
        id={`risk-${id}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        aria-describedby={`risk-${id}-hint`}
        className="block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
      />
      <p id={`risk-${id}-hint`} className="text-xs text-ink-subtle">
        {text.noteHint}
      </p>
      {error && <Alert>{text.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!ready} onClick={() => run("ACTIONED")}>
          {text.handled}
        </Button>
        <Button type="button" variant="secondary" disabled={!ready} onClick={() => run("DISMISSED")}>
          {text.dismiss}
        </Button>
      </div>
    </div>
  );
}
