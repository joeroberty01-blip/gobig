"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, CheckCircle2, MapPin, RotateCcw, Send, Sparkles, Star, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { usePicked } from "@/components/discovery/Compare";
import { askGoBigAIAction, type ChatReply } from "@/lib/actions/aiChat";
import { OPEN_AI_CHAT } from "@/components/home/OpenAiChat";

// Floating Go Big AI chat (owner, 2026-10-10): a small round icon; tapping it opens a chat window over
// the page instead of going to another page. Each question gets the same answer as the Go Big AI page
// (what was understood + up to three real businesses with checked reasons). Only on browsing pages:
// never over a form, a profile's request bar, or the Go Big AI page; it steps aside for the compare bar.
const EXACT = ["/", "/requests", "/saved", "/notifications", "/categories", "/about", "/help"];
const PREFIX = ["/search", "/c/"];
const STORE = "gobig-ai-chat";
const MAX_KEPT = 20;

type Msg = { id: number; role: "user"; text: string } | { id: number; role: "ai"; reply: ChatReply };

function load(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Msg[]).slice(-MAX_KEPT) : [];
  } catch {
    return [];
  }
}

export function AskFab() {
  const { t } = useI18n();
  const a = t.ai;
  const pathname = usePathname();
  const picked = usePicked();
  const [open, setOpen] = useState(false);
  // Read once at start: the window is closed on the first render, so the server and browser agree.
  const [msgs, setMsgs] = useState<Msg[]>(() => (typeof window === "undefined" ? [] : load()));
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Other buttons (the home "Ask Go Big AI" card) open this chat instead of a page.
  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener(OPEN_AI_CHAT, openChat);
    return () => window.removeEventListener(OPEN_AI_CHAT, openChat);
  }, []);
  // The conversation survives moving between pages in this tab (and nothing else: no server copy).
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-MAX_KEPT)));
    } catch {
      /* storage unavailable: the chat just isn't kept */
    }
  }, [msgs]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs, pending, open]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const show = (EXACT.includes(pathname) || PREFIX.some((p) => pathname.startsWith(p))) && !picked.length;
  if (!show) return null;

  const ask = (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    setText("");
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: question }]);
    start(async () => {
      let reply: ChatReply;
      try {
        reply = await askGoBigAIAction({ q: question });
      } catch {
        reply = { ok: false, error: "empty" };
      }
      setMsgs((m) => [...m, { id: Date.now() + 1, role: "ai", reply }]);
    });
  };

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={a.title}
          className="fixed inset-x-2 bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-40 flex h-[min(68dvh,34rem)] flex-col overflow-hidden rounded-3xl bg-surface shadow-[0_24px_60px_-12px_rgba(11,27,51,0.45)] ring-1 ring-line animate-rise sm:inset-x-auto sm:right-4 sm:w-[23rem] md:right-6 md:bottom-24"
        >
          <header className="flex items-center gap-3 nav-gradient px-4 py-3 text-white">
            <span className="relative grid size-9 place-items-center rounded-full bg-white/15">
              <Sparkles aria-hidden className="size-5 text-cta" />
              <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-whatsapp ring-2 ring-[#1b2a6b]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{a.title}</span>
              <span className="block truncate text-[11px] text-white/70">{a.chatNote}</span>
            </span>
            {msgs.length > 0 && (
              <button type="button" onClick={() => setMsgs([])} aria-label={a.chatNew} title={a.chatNew} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
                <RotateCcw aria-hidden className="size-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label={a.chatClose} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
              <X aria-hidden className="size-5" />
            </button>
          </header>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto bg-canvas px-3 py-4" aria-live="polite">
            <Bubble>{a.chatHello}</Bubble>
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-1.5 pl-1">
                {a.examples.map((ex) => (
                  <button key={ex} type="button" onClick={() => ask(ex)} className="rounded-full bg-surface px-3 py-1.5 text-left text-xs text-ink ring-1 ring-line hover:ring-action/40">
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-action px-3.5 py-2 text-sm text-white">{m.text}</p>
                </div>
              ) : (
                <Answer key={m.id} reply={m.reply} onPick={ask} />
              ),
            )}
            {pending && <Bubble muted>{a.chatThinking}</Bubble>}
          </div>

          <form
            className="flex items-center gap-2 border-t border-line bg-surface p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
          >
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder={a.chatPlaceholder}
              aria-label={a.chatPlaceholder}
              enterKeyHint="send"
              className="min-h-11 min-w-0 flex-1 rounded-full bg-canvas px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-subtle focus:ring-action/50 focus:outline-none"
            />
            <button type="submit" disabled={pending || !text.trim()} aria-label={a.chatSend} className="grid size-11 shrink-0 place-items-center rounded-full bg-action text-white transition hover:bg-action-hover active:scale-95 disabled:opacity-50">
              <Send aria-hidden className="size-4.5" />
            </button>
          </form>
        </div>
      )}

      {/* The small round icon. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? a.chatClose : a.chatOpen}
        aria-expanded={open}
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 grid size-13 place-items-center rounded-full nav-gradient text-white shadow-lift ring-4 ring-white/80 transition hover:-translate-y-0.5 active:scale-95 md:right-6 md:bottom-6 dark:ring-white/10"
      >
        {open ? <X aria-hidden className="size-6" /> : <Sparkles aria-hidden className="size-6 text-cta" />}
        {!open && <span aria-hidden className="absolute top-0 right-0 size-3.5 rounded-full bg-whatsapp ring-2 ring-white" />}
      </button>
    </>
  );
}

function Bubble({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <p className={`max-w-[88%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm shadow-soft ring-1 ring-line/60 ${muted ? "animate-pulse text-ink-muted" : "text-ink"}`}>{children}</p>;
}

function Answer({ reply, onPick }: { reply: ChatReply; onPick: (q: string) => void }) {
  const { t } = useI18n();
  const a = t.ai;
  if (!reply.ok) return <Bubble>{reply.error === "rateLimited" ? a.chatRateLimited : reply.error === "tooLong" ? a.tooLong : a.chatError}</Bubble>;

  return (
    <div className="max-w-[94%] space-y-2 rounded-2xl rounded-bl-md bg-surface p-3 text-sm shadow-soft ring-1 ring-line/60">
      <p className="text-ink-muted">{a.chatUnderstood}</p>
      <ul className="flex flex-wrap gap-1.5">
        {reply.understood.map((u) => (
          <li key={u} className="rounded-full bg-action/10 px-2.5 py-0.5 text-xs font-medium text-action">
            {u}
          </li>
        ))}
      </ul>

      {reply.clarify && (
        <div>
          <p className="mt-1">{reply.clarify.text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reply.clarify.options.map((o) => (
              <button key={o} type="button" onClick={() => onPick(o)} className="rounded-full bg-canvas px-3 py-1.5 text-xs ring-1 ring-line hover:ring-action/40">
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {reply.picks.length > 0 ? (
        <>
          <p className="pt-1 font-medium">{a.chatFound}</p>
          <ol className="space-y-2">
            {reply.picks.map((p, i) => (
              <li key={p.slug}>
                <Link href={`/p/${p.slug}`} className="block rounded-xl bg-canvas p-2.5 ring-1 ring-line/60 transition hover:ring-action/40">
                  <span className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-action text-[11px] font-bold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                    {p.demo && <span className="shrink-0 rounded-full bg-cta/15 px-1.5 py-0.5 text-[9px] font-bold text-cta uppercase">{t.ui.demo.tag}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                    <span className="flex items-center gap-1">
                      <Star aria-hidden className="size-3.5 fill-amber-400 text-amber-400" />
                      {p.rating != null && p.reviews > 0 ? `${p.rating.toFixed(1)} · ${fill(a.chatReviews, { count: p.reviews })}` : a.chatNew2}
                    </span>
                    {p.area && (
                      <span className="flex items-center gap-1">
                        <MapPin aria-hidden className="size-3.5" />
                        {p.area}
                      </span>
                    )}
                  </span>
                  {p.reasons.length > 0 && (
                    <span className="mt-1.5 flex flex-col gap-0.5">
                      {p.reasons.map((r) => (
                        <span key={r} className="flex items-center gap-1.5 text-xs text-ink">
                          <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-success" />
                          {r}
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : (
        !reply.clarify && <p className="pt-1">{a.chatNone}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {reply.total > 0 && (
          <Link href={reply.seeAllHref} className="inline-flex items-center gap-1 rounded-full bg-action px-3 py-1.5 text-xs font-semibold text-white hover:bg-action-hover">
            {fill(a.chatSeeAll, { count: reply.total })}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
        <Link href={reply.requestHref} className="inline-flex items-center rounded-full bg-cta/15 px-3 py-1.5 text-xs font-semibold text-cta hover:bg-cta/25">
          {a.chatRequest}
        </Link>
      </div>
    </div>
  );
}
