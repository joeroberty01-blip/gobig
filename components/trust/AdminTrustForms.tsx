"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideVerificationAction, moderateReviewAction, revokeVerificationAction, saveLevelAction } from "@/lib/actions/trust";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/verification-types";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: ErrorKey }>) =>
    start(async () => {
      setError(null);
      setDone(false);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setDone(true);
      router.refresh();
    });
  return { pending, error, done, run };
}

const textarea = "block w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base";

export function DecisionForm({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const { pending, error, done, run } = useRun();
  const decide = (decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES") => run(() => decideVerificationAction({ requestId, decision, note }));

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      {done && <Alert tone="success">{t.trust.admin.decided}</Alert>}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.trust.admin.decisionNote}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={textarea} />
        <span className="text-xs font-normal text-ink-subtle">{t.trust.admin.decisionNoteHint}</span>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" disabled={pending} onClick={() => decide("APPROVE")}>
          {pending ? t.trust.admin.deciding : t.trust.admin.approve}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => decide("REQUEST_CHANGES")}>
          {t.trust.admin.requestChanges}
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={() => decide("REJECT")}>
          {t.trust.admin.reject}
        </Button>
      </div>
    </div>
  );
}

export function RevokeForm({ providerId }: { providerId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useRun();
  if (!open) {
    return (
      <Button type="button" variant="ghost" className="min-h-9 text-danger" onClick={() => setOpen(true)}>
        {t.trust.admin.revoke}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <Field id="revoke-reason" label={t.trust.admin.revokeReason}>
        <Input id="revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      <Button type="button" variant="danger" disabled={pending} onClick={() => run(() => revokeVerificationAction({ providerId, reason }))}>
        {t.trust.admin.revoke}
      </Button>
    </div>
  );
}

export function ModerationButtons({ reviewId, status }: { reviewId: string; status: "PUBLISHED" | "HIDDEN" }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const { pending, error, run } = useRun();
  const act = (action: "HIDE" | "RESTORE" | "DISMISS") => run(() => moderateReviewAction({ reviewId, action, note }));
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t.trust.admin.moderationNote} aria-label={t.trust.admin.moderationNote} />
      <div className="flex flex-wrap gap-2">
        {status === "PUBLISHED" ? (
          <Button type="button" variant="danger" className="min-h-9" disabled={pending} onClick={() => act("HIDE")}>
            {t.trust.admin.hide}
          </Button>
        ) : (
          <Button type="button" variant="secondary" className="min-h-9" disabled={pending} onClick={() => act("RESTORE")}>
            {t.trust.admin.restore}
          </Button>
        )}
        <Button type="button" variant="secondary" className="min-h-9" disabled={pending} onClick={() => act("DISMISS")}>
          {t.trust.admin.dismiss}
        </Button>
      </div>
    </div>
  );
}

type Level = {
  id?: string;
  slug: string;
  nameEn: string;
  nameSw: string;
  descriptionEn: string;
  descriptionSw: string;
  rank: number;
  requiredDocuments: DocumentType[];
  isActive: boolean;
};

export function LevelForm({ level }: { level?: Level }) {
  const { t } = useI18n();
  const [v, setV] = useState<Level>(
    level ?? { slug: "", nameEn: "", nameSw: "", descriptionEn: "", descriptionSw: "", rank: 1, requiredDocuments: [], isActive: true },
  );
  const { pending, error, done, run } = useRun();
  const set = <K extends keyof Level>(k: K, value: Level[K]) => setV((x) => ({ ...x, [k]: value }));
  const idp = level?.id ?? "new";

  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), run(() => saveLevelAction(v)))} className="flex flex-col gap-3">
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      {done && <Alert tone="success">{t.profile.setup.saved}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${idp}-slug`} label={t.trust.admin.slug}>
          <Input id={`${idp}-slug`} value={v.slug} onChange={(e) => set("slug", e.target.value)} />
        </Field>
        <Field id={`${idp}-rank`} label={t.trust.admin.rank}>
          <Input id={`${idp}-rank`} type="number" min={1} max={10} value={v.rank} onChange={(e) => set("rank", Number(e.target.value))} />
        </Field>
        <Field id={`${idp}-en`} label={t.trust.admin.nameEn}>
          <Input id={`${idp}-en`} value={v.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
        </Field>
        <Field id={`${idp}-sw`} label={t.trust.admin.nameSw}>
          <Input id={`${idp}-sw`} value={v.nameSw} onChange={(e) => set("nameSw", e.target.value)} />
        </Field>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t.trust.admin.descEn}
        <textarea value={v.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} rows={2} className={textarea} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t.trust.admin.descSw}
        <textarea value={v.descriptionSw} onChange={(e) => set("descriptionSw", e.target.value)} rows={2} className={textarea} />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t.trust.admin.required}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {DOCUMENT_TYPES.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={v.requiredDocuments.includes(d)}
                onChange={(e) => set("requiredDocuments", e.target.checked ? [...v.requiredDocuments, d] : v.requiredDocuments.filter((x) => x !== d))}
              />
              {t.trust.docTypes[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-brand-700" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        {t.trust.admin.active}
      </label>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {t.trust.admin.saveLevel}
      </Button>
    </form>
  );
}
