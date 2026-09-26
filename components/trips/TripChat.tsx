"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MessageCircle, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { Alert, Card } from "@/components/ui";
import { sendTripMessageAction } from "@/lib/actions/trips";

type Msg = { id: string; sender: string; body: string; createdAt: string | Date };

/** In-app chat for a live trip, with WhatsApp as the other option (Phase 17). */
export function TripChat({ tripId, me, other, messages, canChat, whatsapp, onSent }: { tripId: string; me: "CUSTOMER" | "DRIVER"; other: string; messages: Msg[]; canChat: boolean; whatsapp?: string | null; onSent: () => void }) {
  const { t, locale } = useI18n();
  const tr = t.trips;
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const time = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  if (!canChat && messages.length === 0) return null;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    start(async () => {
      setError(null);
      const r = await sendTripMessageAction(tripId, body);
      if (r.ok) {
        setText("");
        onSent();
      } else setError(r.error === "forbidden" ? tr.errors.notAllowed : tr.errors[r.error]);
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <MessageCircle aria-hidden className="size-5 text-link" />
          {fill(tr.chatWith, { name: other })}
        </h2>
        {canChat && whatsapp && (
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center gap-1.5 rounded-full bg-whatsapp px-3 text-xs font-bold text-white">
            {tr.whatsapp}
          </a>
        )}
      </div>
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-xl bg-canvas p-3" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-ink-muted">{tr.noMessages}</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender === me;
            return (
              <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "self-end rounded-br-md bg-action text-white" : "self-start rounded-bl-md bg-surface text-ink shadow-soft"}`}>
                <p className="break-words whitespace-pre-line">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${mine ? "text-white/60" : "text-ink-subtle"}`}>{time.format(new Date(m.createdAt))}</p>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
      {canChat ? (
        <form onSubmit={send} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={tr.chatPlaceholder}
            aria-label={tr.chatPlaceholder}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-base"
          />
          <button type="submit" disabled={pending || !text.trim()} aria-label={tr.send} className="grid size-11 shrink-0 place-items-center rounded-xl bg-cta text-white disabled:opacity-50">
            <Send aria-hidden className="size-4.5" />
          </button>
        </form>
      ) : (
        <p className="text-xs text-ink-subtle">{tr.chatClosed}</p>
      )}
      {error && <Alert>{error}</Alert>}
    </Card>
  );
}
