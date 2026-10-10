"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Alert, Button, Card } from "@/components/ui";
import { saveNotificationPrefsAction } from "@/lib/actions/notifications";
import type { Preferences } from "@/lib/notifications/preferences";

const CATEGORY_ORDER = ["REQUESTS", "MESSAGES", "TRIPS", "REVIEWS", "REMINDERS", "ACCOUNT", "SUMMARIES", "MARKETING"] as const;
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h! * 60 + m! : 0;
};

/** Automation Engine, Phase C: push on this device, channels per category, quiet hours. */
export function NotificationSettings({ initial, vapidKey, hasEmail, hasPhone }: { initial: Preferences; vapidKey: string | null; hasEmail: boolean; hasPhone: boolean }) {
  const { t } = useI18n();
  const n = t.notify;
  const [prefs, setPrefs] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const quiet = prefs.quietStart !== null && prefs.quietEnd !== null;

  const toggle = (c: (typeof CATEGORY_ORDER)[number], ch: "push" | "email" | "sms") =>
    setPrefs((p) => ({ ...p, categories: { ...p.categories, [c]: { ...p.categories[c], [ch]: !p.categories[c][ch] } } }));

  const save = () =>
    start(async () => {
      const r = await saveNotificationPrefsAction(prefs);
      setMsg({ ok: r.ok, text: r.ok ? n.saved : n.error });
    });

  return (
    <div className="flex flex-col gap-4">
      <PushCard vapidKey={vapidKey} />

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-line px-4 py-3 text-xs font-semibold text-ink-muted sm:gap-x-4">
          <span />
          <span className="w-11 text-center">{n.channels.push}</span>
          <span className="w-11 text-center">{n.channels.sms}</span>
          <span className="w-11 text-center">{n.channels.email}</span>
        </div>
        <ul className="divide-y divide-line">
          {CATEGORY_ORDER.map((c) => (
            <li key={c} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-4 py-3 sm:gap-x-4">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{n.categories[c].label}</span>
                <span className="block text-xs text-ink-muted">{n.categories[c].hint}</span>
              </span>
              {(["push", "sms", "email"] as const).map((ch) => (
                <span key={ch} className="flex w-11 justify-center">
                  <input
                    type="checkbox"
                    aria-label={`${n.categories[c].label} — ${n.channels[ch]}`}
                    checked={prefs.categories[c][ch]}
                    disabled={(ch === "email" && !hasEmail) || (ch === "sms" && !hasPhone)}
                    onChange={() => toggle(c, ch)}
                    className="size-5 accent-[var(--color-link)]"
                  />
                </span>
              ))}
            </li>
          ))}
        </ul>
        {!hasEmail && <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">{n.noEmail}</p>}
        {!hasPhone && <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">{n.noPhone}</p>}
        <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">{n.smsNote}</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-bold">{n.quietTitle}</h2>
          <p className="text-sm text-ink-muted">{n.quietHint}</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={quiet}
            onChange={(e) => setPrefs((p) => ({ ...p, quietStart: e.target.checked ? 21 * 60 : null, quietEnd: e.target.checked ? 7 * 60 : null }))}
            className="size-5 accent-[var(--color-link)]"
          />
          {n.quietOn}
        </label>
        {quiet && (
          <div className="grid grid-cols-2 gap-3">
            {(["quietStart", "quietEnd"] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-sm">
                {k === "quietStart" ? n.from : n.to}
                <input type="time" value={toTime(prefs[k] ?? 0)} onChange={(e) => setPrefs((p) => ({ ...p, [k]: fromTime(e.target.value) }))} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base" />
              </label>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending} variant="cta" className="min-w-32">
          {n.save}
        </Button>
        {msg && (
          <span role="status" className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState = "loading" | "unsupported" | "unavailable" | "blocked" | "off" | "on";

function PushCard({ vapidKey }: { vapidKey: string | null }) {
  const { t } = useI18n();
  const n = t.notify;
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (!vapidKey) return setState("unavailable");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("off"));
  }, [vapidKey]);

  const turnOn = () =>
    start(async () => {
      setError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) }));
        const res = await fetch("/api/push/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
        if (!res.ok) throw new Error(String(res.status));
        setState("on");
      } catch {
        setError(n.pushFailed);
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState("off");
    });

  const note = state === "unsupported" ? n.pushUnsupported : state === "unavailable" ? n.pushUnavailable : state === "blocked" ? n.pushBlocked : state === "on" ? n.pushEnabled : n.pushHint;
  return (
    <Card className="flex items-center gap-4">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${state === "on" ? "bg-success-soft text-success" : "bg-canvas text-ink-muted"}`}>
        <BellRing aria-hidden className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{n.pushTitle}</p>
        <p className="text-sm text-ink-muted">{note}</p>
        {error && <Alert>{error}</Alert>}
      </div>
      {(state === "off" || state === "on") && (
        <Button variant={state === "on" ? "secondary" : "cta"} onClick={state === "on" ? turnOff : turnOn} disabled={pending} className="shrink-0">
          {state === "on" ? n.pushOff : n.pushOn}
        </Button>
      )}
    </Card>
  );
}
