"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { fileReportAction } from "@/lib/actions/adminPlatform";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, Field } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];
const REASONS = ["SPAM", "FAKE", "FRAUD", "OFFENSIVE", "UNSAFE", "OTHER"] as const;

/** Report a provider, a request or a conversation to NEXA (Phase 12, SEC-028). */
export function ReportButton({ targetType, targetId }: { targetType: "PROVIDER" | "REQUEST" | "CONVERSATION"; targetId: string }) {
  const { t } = useI18n();
  const r = t.adminPlatform.report;
  const reasons = t.adminPlatform.reports.reasons;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("SPAM");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) return <p className="text-xs text-ink-muted">{r.sent}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-ink-subtle hover:text-danger">
        <Flag aria-hidden className="size-3.5" />
        {r.button}
      </button>
    );
  }
  return (
    <form
      noValidate
      className="flex w-full flex-col gap-2 rounded-xl border border-line bg-canvas p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await fileReportAction({ targetType, targetId, reason, note });
          if (!res.ok) return setError(res.error);
          setSent(true);
        });
      }}
    >
      <p className="text-sm font-semibold">{r.title}</p>
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <Field id={`rep-reason-${targetId}`} label={r.reason}>
        <select
          id={`rep-reason-${targetId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
          className="block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base"
        >
          {REASONS.map((x) => (
            <option key={x} value={x}>
              {reasons[x]}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`rep-note-${targetId}`} label={r.note}>
        <textarea
          id={`rep-note-${targetId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          className="block w-full rounded-xl border border-line bg-surface px-3 py-2 text-base"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" className="min-h-9" disabled={pending}>
          {r.send}
        </Button>
        <Button type="button" variant="ghost" className="min-h-9" onClick={() => setOpen(false)}>
          {r.close}
        </Button>
      </div>
    </form>
  );
}
