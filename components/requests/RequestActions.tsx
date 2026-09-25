"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import {
  acceptProviderAction,
  cancelRequestAction,
  completeRequestAction,
  declineAction,
  interestAction,
  markNotificationsReadAction,
  markRequestSeenAction,
  sendMessageAction,
  sendQuoteAction,
  withdrawQuoteAction,
} from "@/lib/actions/requests";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];
type Result = { ok: true } | { ok: false; error: ErrorKey; field?: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ key: ErrorKey; field?: string } | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError({ key: r.error, field: r.field });
      after?.();
      router.refresh();
    });
  return { pending, error, run };
}

function ErrorText({ error }: { error: { key: ErrorKey } | null }) {
  const { t } = useI18n();
  return error ? <Alert>{t.errors[error.key] ?? t.errors.generic}</Alert> : null;
}

/** Marks this request's notifications and the other side's messages as read, once per visit. */
export function MarkSeen({ requestId }: { requestId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markRequestSeenAction(requestId);
  }, [requestId]);
  return null;
}

// ─── Customer ───────────────────────────────────────────────────────────────────────────────

export function AcceptButton({ requestId, providerId, providerName }: { requestId: string; providerId: string; providerName: string }) {
  const { t } = useI18n();
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <ErrorText error={error} />
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(t.requests.detail.acceptConfirm.replaceAll("{name}", providerName))) run(() => acceptProviderAction({ requestId, providerId }));
        }}
      >
        {t.requests.detail.accept}
      </Button>
    </div>
  );
}

export function CustomerControls({ requestId, canCancel, canComplete }: { requestId: string; canCancel: boolean; canComplete: boolean }) {
  const { t } = useI18n();
  const d = t.requests.detail;
  const { pending, error, run } = useAction();
  if (!canCancel && !canComplete) return null;
  return (
    <div className="flex flex-col gap-2">
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2">
        {canComplete && (
          <Button type="button" disabled={pending} onClick={() => confirm(d.completeConfirm) && run(() => completeRequestAction(requestId))}>
            {d.complete}
          </Button>
        )}
        {canCancel && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => confirm(d.cancelConfirm) && run(() => cancelRequestAction(requestId))}>
            {d.cancel}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Conversation (both sides) ──────────────────────────────────────────────────────────────

export type ChatMessage = { id: string; senderRole: "CUSTOMER" | "PROVIDER"; body: string; createdAt: Date };

export function Conversation({
  matchId,
  messages,
  me,
  otherName,
  open,
}: {
  matchId: string;
  messages: ChatMessage[];
  me: "CUSTOMER" | "PROVIDER";
  otherName: string;
  open: boolean;
}) {
  const { t, locale } = useI18n();
  const d = t.requests.detail;
  const [body, setBody] = useState("");
  const { pending, error, run } = useAction();
  const time = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="flex flex-col gap-2">
      {messages.length === 0 ? (
        <p className="text-sm text-ink-subtle">{d.noMessages}</p>
      ) : (
        <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {messages.map((m) => {
            const mine = m.senderRole === me;
            return (
              <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${mine ? "bg-brand-700 text-white" : "bg-canvas text-ink"}`}>
                  {m.body}
                </div>
                <span className="mt-0.5 text-[11px] text-ink-subtle">
                  {mine ? d.you : otherName} · {time.format(new Date(m.createdAt))}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {open ? (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => sendMessageAction({ matchId, body }), () => setBody(""));
          }}
        >
          <ErrorText error={error} />
          <div className="flex items-end gap-2">
            <textarea
              aria-label={d.messagePlaceholder}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={d.messagePlaceholder}
              className="block min-h-11 w-full flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-base focus:outline-2 focus:outline-brand-500"
            />
            <Button type="submit" disabled={pending || !body.trim()} aria-label={d.send} className="shrink-0">
              <Send aria-hidden className="size-4" />
              <span className="hidden sm:inline">{d.send}</span>
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-ink-subtle">{d.closedConversation}</p>
      )}
    </div>
  );
}

// ─── Provider ───────────────────────────────────────────────────────────────────────────────

export function ProviderResponse({
  requestId,
  matchStatus,
  quote,
}: {
  requestId: string;
  matchStatus: string;
  quote: { amount: number; note: string | null; validUntil: Date | null; status: string } | null;
}) {
  const { t } = useI18n();
  const p = t.requests.provider;
  const { pending, error, run } = useAction();
  const editable = !quote || quote.status === "SENT" || quote.status === "WITHDRAWN";
  const [amount, setAmount] = useState(quote && quote.status === "SENT" ? String(quote.amount) : "");
  const [note, setNote] = useState(quote?.note ?? "");
  const [validUntil, setValidUntil] = useState(quote?.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : "");
  const fieldError = (f: string) => (error?.field === f ? (t.errors[error.key] ?? t.errors.generic) : undefined);

  return (
    <div className="flex flex-col gap-4">
      {error && !error.field && <ErrorText error={error} />}
      <div className="flex flex-wrap gap-2">
        {matchStatus === "NOTIFIED" && (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => interestAction(requestId))}>
            {p.interested}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={pending} onClick={() => confirm(p.declineConfirm) && run(() => declineAction(requestId))}>
          {p.decline}
        </Button>
      </div>
      {editable && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => sendQuoteAction({ requestId, amount, note, validUntil: validUntil || null }));
          }}
        >
          <h3 className="font-semibold">{p.quoteTitle}</h3>
          <Field id="amount" label={p.amount} error={fieldError("amount")}>
            <Input id="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="note" label={p.note} error={fieldError("note")}>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="block w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base focus:outline-2 focus:outline-brand-500"
            />
          </Field>
          <Field id="validUntil" label={p.validUntil} error={fieldError("validUntil")}>
            <Input id="validUntil" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {quote?.status === "SENT" ? p.updateQuote : p.sendQuote}
            </Button>
            {quote?.status === "SENT" && (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => withdrawQuoteAction(requestId))}>
                {p.withdrawQuote}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Notifications ──────────────────────────────────────────────────────────────────────────

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className="min-h-9"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          await markNotificationsReadAction();
          router.refresh();
        })
      }
    >
      {t.requests.notifications.markAll}
    </Button>
  );
}
