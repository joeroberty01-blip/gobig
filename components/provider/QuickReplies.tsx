"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ThumbsUp } from "lucide-react";
import { replyInterestedAction, replyMessageAction, type ReplyResult } from "@/lib/actions/replyLink";
import type { ReplyLinkText } from "@/lib/i18n/replyLink";

type Text = Pick<ReplyLinkText, "interested" | "quick" | "done" | "closed" | "limit" | "invalid" | "error">;

/**
 * Quick replies on the provider dashboard (design wave 3). They go through the same signed,
 * rate-limited reply-link actions as the SMS page (SEC-067), so the rules are identical.
 */
export function QuickReplies({ token, text }: { token: string; text: Text }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ReplyResult>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) return setSent(true);
      setError(r.error === "limit" ? text.limit : r.error === "closed" ? text.closed : r.error === "invalid" ? text.invalid : text.error);
    });

  if (sent)
    return (
      <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success">
        <CheckCircle2 aria-hidden className="size-4" />
        {text.done}
      </p>
    );

  const chip = "relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-60";
  return (
    <div className="mt-2">
      {error && <p role="alert" className="mb-1 text-xs text-danger">{error}</p>}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
        <button type="button" disabled={pending} onClick={() => run(() => replyInterestedAction(token))} className={`${chip} bg-action text-white`}>
          <ThumbsUp aria-hidden className="size-3.5" />
          {text.interested}
        </button>
        {text.quick.slice(0, 3).map((q) => (
          <button key={q} type="button" disabled={pending} onClick={() => run(() => replyMessageAction(token, q))} className={`${chip} bg-surface text-ink ring-1 ring-line`}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
