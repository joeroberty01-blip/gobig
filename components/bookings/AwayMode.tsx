"use client";

import { useState, useTransition } from "react";
import { Palmtree } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { setAwayAction } from "@/lib/actions/bookings";

/** Automation Engine, Phase D: the business switches away mode on (until a date) or off. */
export function AwayMode({ awayUntil, awayNote }: { awayUntil: string | null; awayNote: string | null }) {
  const { t, locale } = useI18n();
  const a = t.bookings.away;
  const [until, setUntil] = useState("");
  const [note, setNote] = useState(awayNote ?? "");
  const [current, setCurrent] = useState(awayUntil);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fmt = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const away = current && new Date(current) > new Date();

  const save = (value: string | null) =>
    start(async () => {
      const r = await setAwayAction(value, note);
      if (!r.ok) return setMsg({ ok: false, text: (a.errors as Record<string, string>)[r.error] ?? a.errors.forbidden });
      setCurrent(value ? new Date(`${value}:00+03:00`).toISOString() : null);
      setMsg(value && r.affected ? { ok: true, text: fill(a.affected, { count: r.affected }) } : null);
    });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${away ? "bg-cta/15 text-cta" : "bg-canvas text-ink-muted"}`}>
          <Palmtree aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">{a.title}</h2>
          <p className="text-sm text-ink-muted">{away ? fill(a.onUntil, { date: fmt.format(new Date(current!)) }) : a.intro}</p>
        </div>
      </div>
      {away ? (
        <Button variant="secondary" disabled={pending} onClick={() => save(null)}>
          {a.turnOff}
        </Button>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(until);
          }}
        >
          <Field id="away-until" label={a.until}>
            <Input id="away-until" type="datetime-local" required value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <Field id="away-note" label={a.note}>
            <Input id="away-note" value={note} maxLength={160} placeholder={a.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="cta" disabled={pending || !until}>
              {a.turnOn}
            </Button>
          </div>
        </form>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
    </Card>
  );
}
