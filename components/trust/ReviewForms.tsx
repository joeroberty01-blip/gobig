"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Star } from "lucide-react";
import { deleteReviewAction, reportReviewAction, respondAction, deleteResponseAction, saveReviewAction } from "@/lib/actions/trust";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: ErrorKey }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setDone(true);
      after?.();
      router.refresh();
    });
  return { pending, error, done, run, setDone };
}

const textarea =
  "block w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base focus:outline-2 focus:outline-brand-500";

export function ReviewForm({ providerId, existing }: { providerId: string; existing: { id: string; rating: number; body: string; status: string } | null }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const { pending, error, done, run } = useAction();

  return (
    <form
      noValidate
      onSubmit={(e) => (e.preventDefault(), run(() => saveReviewAction({ providerId, rating, body })))}
      className="flex flex-col gap-3"
    >
      <h3 className="font-semibold">{existing ? t.trust.reviews.editTitle : t.trust.reviews.writeTitle}</h3>
      {existing?.status === "HIDDEN" && <Alert tone="info">{t.trust.reviews.hiddenNotice}</Alert>}
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      {done && !error && <Alert tone="success">{t.trust.reviews.thanks}</Alert>}
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t.trust.reviews.yourRating}</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={fill(n === 1 ? t.trust.reviews.star : t.trust.reviews.stars, { n })}
              onClick={() => setRating(n)}
              className="grid size-11 place-items-center rounded-lg hover:bg-canvas"
            >
              <Star aria-hidden className={`size-7 ${n <= rating ? "fill-accent-400 text-accent-500" : "text-line"}`} />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.trust.reviews.body}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1000} className={textarea} />
        <span className="text-xs font-normal text-ink-subtle">{t.trust.reviews.bodyHint}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t.trust.reviews.posting : existing ? t.trust.reviews.update : t.trust.reviews.post}
        </Button>
        {existing && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => window.confirm(t.trust.reviews.deleteConfirm) && run(() => deleteReviewAction(existing.id))}
          >
            {t.trust.reviews.delete}
          </Button>
        )}
      </div>
    </form>
  );
}

const REASONS = ["SPAM", "FAKE", "OFFENSIVE", "CONFLICT_OF_INTEREST", "OTHER"] as const;

export function ReportButton({ reviewId }: { reviewId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("SPAM");
  const [note, setNote] = useState("");
  const { pending, error, done, run } = useAction();

  if (done) return <p className="text-xs text-success">{t.trust.reviews.reported}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink">
        <Flag aria-hidden className="size-3.5" />
        {t.trust.reviews.report}
      </button>
    );
  }
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), run(() => reportReviewAction({ reviewId, reason, note })))} className="mt-2 flex flex-col gap-2 rounded-xl bg-canvas p-3">
      <p className="text-sm font-semibold">{t.trust.reviews.reportTitle}</p>
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <label className="text-sm">
        <span className="sr-only">{t.trust.reviews.reportReason}</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} className="block min-h-10 w-full rounded-lg border border-line bg-surface px-2">
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {t.trust.reviews.reasons[r]}
            </option>
          ))}
        </select>
      </label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder={t.trust.reviews.reportNote} aria-label={t.trust.reviews.reportNote} className={textarea} />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="min-h-9" disabled={pending}>
          {t.trust.reviews.sendReport}
        </Button>
        <Button type="button" variant="ghost" className="min-h-9" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Provider's reply box (dashboard). The customer's review above it is read-only. */
export function ResponseForm({ reviewId, existing }: { reviewId: string; existing: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(existing ?? "");
  const { pending, error, run } = useAction();

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="min-h-9" onClick={() => setOpen(true)}>
        {existing ? t.trust.reviews.editResponse : t.trust.reviews.respond}
      </Button>
    );
  }
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), run(() => respondAction({ reviewId, body }), () => setOpen(false)))} className="flex flex-col gap-2">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} placeholder={t.trust.reviews.responsePlaceholder} aria-label={t.trust.reviews.respond} className={textarea} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-9" disabled={pending}>
          {t.trust.reviews.saveResponse}
        </Button>
        {existing && (
          <Button type="button" variant="ghost" className="min-h-9" disabled={pending} onClick={() => run(() => deleteResponseAction(reviewId), () => setOpen(false))}>
            {t.trust.reviews.deleteResponse}
          </Button>
        )}
        <Button type="button" variant="ghost" className="min-h-9" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
