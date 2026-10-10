"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, MessageCircle, Send, ThumbsUp, X } from "lucide-react";
import { replyDeclineAction, replyInterestedAction, replyMessageAction, replyQuoteAction, type ReplyResult } from "@/lib/actions/replyLink";
import type { ReplyLinkText } from "@/lib/i18n/replyLink";

/** The one-tap reply buttons on /r/<token>: big, few, and usable on any phone. */
export function ReplyLinkForm({ token, text }: { token: string; text: ReplyLinkText }) {
  const [state, setState] = useState<"idle" | "done" | "declined">("idle");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<ReplyResult>, after: "done" | "declined" = "done") =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) return setState(after);
      setError(r.error === "limit" ? text.limit : r.error === "closed" ? text.closed : r.error === "invalid" ? text.invalid : text.error);
    });

  if (state !== "idle")
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-success-soft p-4 text-sm font-medium text-success">
        <CheckCircle2 aria-hidden className="size-5 shrink-0" />
        {state === "done" ? text.done : text.declined}
      </p>
    );

  const btn = "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60";
  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      <button type="button" disabled={pending} onClick={() => run(() => replyInterestedAction(token))} className={`${btn} bg-action text-white`}>
        <ThumbsUp aria-hidden className="size-5" />
        {text.interested}
      </button>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
          <MessageCircle aria-hidden className="size-4" />
          {text.quickTitle}
        </h2>
        <div className="grid gap-2">
          {text.quick.map((q) => (
            <button key={q} type="button" disabled={pending} onClick={() => run(() => replyMessageAction(token, q))} className={`${btn} justify-start bg-surface text-ink ring-1 ring-line`}>
              {q}
            </button>
          ))}
        </div>
      </section>

      <form
        className="rounded-2xl bg-surface p-4 ring-1 ring-line"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => replyQuoteAction(token, { amount, note }));
        }}
      >
        <h2 className="mb-2 text-sm font-semibold text-ink-muted">{text.priceTitle}</h2>
        <label className="block text-xs text-ink-muted" htmlFor="rl-amount">
          {text.amount}
        </label>
        <input id="rl-amount" inputMode="numeric" pattern="[0-9]*" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className="mt-1 block min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base" />
        <label className="mt-3 block text-xs text-ink-muted" htmlFor="rl-note">
          {text.note}
        </label>
        <input id="rl-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base" />
        <button type="submit" disabled={pending || !amount} className={`${btn} mt-3 bg-cta text-white`}>
          <Send aria-hidden className="size-4" />
          {text.sendPrice}
        </button>
      </form>

      <button type="button" disabled={pending} onClick={() => run(() => replyDeclineAction(token), "declined")} className={`${btn} text-ink-muted`}>
        <X aria-hidden className="size-4" />
        {text.decline}
      </button>
    </div>
  );
}
