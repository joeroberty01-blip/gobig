"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload } from "lucide-react";
import {
  cancelVerificationAction,
  removeVerificationDocAction,
  startVerificationAction,
  submitVerificationAction,
} from "@/lib/actions/trust";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/verification-types";
import { Alert, Button } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

export function StartVerification({ levels }: { levels: { id: string; nameEn: string; nameSw: string; descriptionEn: string; descriptionSw: string; requiredDocuments: DocumentType[] }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [levelId, setLevelId] = useState(levels[0]?.id ?? "");

  return (
    <form
      noValidate
      onSubmit={(e) => (
        e.preventDefault(),
        start(async () => {
          const r = await startVerificationAction({ levelId });
          if (!r.ok) setError(r.error);
          router.refresh();
        })
      )}
      className="flex flex-col gap-3"
    >
      <p className="text-sm font-medium">{t.trust.provider.chooseLevel}</p>
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      {levels.map((l) => (
        <label key={l.id} className={`flex cursor-pointer gap-3 rounded-2xl border bg-surface p-4 ${levelId === l.id ? "border-brand-500" : "border-line"}`}>
          <input type="radio" name="level" checked={levelId === l.id} onChange={() => setLevelId(l.id)} className="mt-0.5 size-5 accent-brand-700" />
          <span>
            <span className="block font-semibold">{locale === "sw" ? l.nameSw : l.nameEn}</span>
            <span className="block text-sm text-ink-muted">{locale === "sw" ? l.descriptionSw : l.descriptionEn}</span>
            <span className="mt-1 block text-xs text-ink-subtle">
              {l.requiredDocuments.length
                ? t.trust.provider.requiredDocs.replace("{docs}", l.requiredDocuments.map((d) => t.trust.docTypes[d]).join(", "))
                : t.trust.provider.anyDoc}
            </span>
          </span>
        </label>
      ))}
      <Button type="submit" disabled={pending || !levelId} className="w-full sm:w-auto">
        {t.trust.provider.start}
      </Button>
    </form>
  );
}

export function OpenRequest({
  request,
}: {
  request: {
    id: string;
    status: "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED";
    decisionNote: string | null;
    requiredDocuments: DocumentType[];
    documents: { id: string; type: DocumentType; mimeType: string; bytes: number }[];
  };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [type, setType] = useState<DocumentType>(request.requiredDocuments.find((d) => !request.documents.some((x) => x.type === d)) ?? "NATIONAL_ID");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editable = request.status !== "SUBMITTED";
  // Shown up front so the provider knows what's left; the server enforces the same rule on submit.
  const missing = request.requiredDocuments.filter((d) => !request.documents.some((x) => x.type === d));

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.set("requestId", request.id);
      body.set("type", type);
      body.set("file", file, "document");
      const res = await fetch("/api/provider/verification-docs", { method: "POST", body });
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: ErrorKey }).error ?? "generic");
      router.refresh();
    } catch {
      setError("generic");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const act = (fn: () => ReturnType<typeof submitVerificationAction>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {request.decisionNote && request.status === "CHANGES_REQUESTED" && (
        <Alert tone="info">
          <strong>{t.trust.provider.reviewerNote}:</strong> {request.decisionNote}
        </Alert>
      )}
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}

      <section>
        <h3 className="mb-2 text-sm font-semibold">{t.trust.provider.documents}</h3>
        {request.documents.length > 0 && (
          <ul className="mb-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {request.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <FileText aria-hidden className="size-5 shrink-0 text-ink-subtle" />
                <span className="flex-1">
                  <span className="block font-medium">{t.trust.docTypes[d.type]}</span>
                  <span className="text-xs text-ink-subtle">
                    {d.mimeType === "application/pdf" ? "PDF" : "JPG"} · {Math.max(1, Math.round(d.bytes / 1024))} KB
                  </span>
                </span>
                {editable && (
                  <button type="button" aria-label={t.trust.provider.remove} disabled={pending} onClick={() => act(() => removeVerificationDocAction(d.id))} className="grid size-9 place-items-center rounded-lg text-ink-subtle hover:bg-canvas">
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1 text-sm">
              <span className="sr-only">{t.trust.provider.docType}</span>
              <select value={type} onChange={(e) => setType(e.target.value as DocumentType)} className="block min-h-11 w-full rounded-xl border border-line bg-surface px-3">
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {t.trust.docTypes[d]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="secondary" disabled={uploading} onClick={() => input.current?.click()}>
              <Upload aria-hidden className="size-4" />
              {uploading ? t.trust.provider.uploading : t.trust.provider.addDocument}
            </Button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" aria-label={t.trust.provider.addDocument} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        )}
        <p className="mt-2 text-xs text-ink-subtle">{t.trust.provider.docHint}</p>
        {editable && missing.length > 0 && (
          <p className="mt-2 text-sm font-medium text-accent-500">
            {t.trust.provider.requiredDocs.replace("{docs}", missing.map((d) => t.trust.docTypes[d]).join(", "))}
          </p>
        )}
      </section>

      {editable && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.trust.provider.noteLabel}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="block w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base" />
        </label>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {editable && (
          <Button type="button" disabled={pending || request.documents.length === 0 || missing.length > 0} onClick={() => act(() => submitVerificationAction({ requestId: request.id, note }))}>
            {pending ? t.trust.provider.submitting : t.trust.provider.submit}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={pending} onClick={() => window.confirm(t.trust.provider.cancelConfirm) && act(() => cancelVerificationAction(request.id))}>
          {t.trust.provider.cancel}
        </Button>
      </div>
    </div>
  );
}
