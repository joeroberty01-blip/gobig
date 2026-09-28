"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { cancelBookingAction, confirmBookingAction, proposeTimeAction } from "@/lib/actions/bookings";

export type BookingView = {
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  scheduledAt: string;
  proposedBy: "CUSTOMER" | "PROVIDER";
  note: string | null;
  cancelledBy: "CUSTOMER" | "PROVIDER" | null;
} | null;

const TONE = { PENDING: "bg-cta/15 text-cta", CONFIRMED: "bg-success-soft text-success", CANCELLED: "bg-canvas text-ink-muted", COMPLETED: "bg-success-soft text-success" };

/** Automation Engine, Phase D: agree a time for an accepted request (both sides use this). */
export function BookingPanel({ requestId, side, otherName, booking, canBook }: { requestId: string; side: "CUSTOMER" | "PROVIDER"; otherName: string; booking: BookingView; canBook: boolean }) {
  const { t, locale } = useI18n();
  const b = t.bookings;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const fmt = new Intl.DateTimeFormat(locale === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Dar_es_Salaam" });
  const err = (e: string) => (b.errors as Record<string, string>)[e] ?? b.errors.forbidden;
  const live = booking && (booking.status === "PENDING" || booking.status === "CONFIRMED");

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(err(r.error ?? "forbidden"));
      else after?.();
    });

  if (!canBook && !booking) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <CalendarClock aria-hidden className="size-5 text-link" />
          {b.title}
        </h2>
        {booking && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[booking.status]}`}>{b.status[booking.status]}</span>}
      </div>

      {booking ? (
        <div className="rounded-xl bg-canvas p-3">
          <p className="text-base font-bold">{fmt.format(new Date(booking.scheduledAt))}</p>
          {booking.note && <p className="mt-1 text-sm text-ink-muted">“{booking.note}”</p>}
          <p className="mt-1 text-xs text-ink-muted">
            {booking.status === "PENDING" && (booking.proposedBy === side ? b.proposedByYou : fill(b.proposedByThem, { name: otherName }))}
            {booking.status === "CONFIRMED" && b.confirmedHint}
            {booking.status === "CANCELLED" && booking.cancelledBy && b.cancelledBy[booking.cancelledBy]}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{b.none}</p>
      )}

      {error && <Alert>{error}</Alert>}

      {canBook && (
        <div className="flex flex-wrap gap-2">
          {booking?.status === "PENDING" && booking.proposedBy !== side && (
            <Button variant="cta" disabled={pending} onClick={() => act(() => confirmBookingAction(requestId))}>
              {b.confirm}
            </Button>
          )}
          {!open && (
            <Button variant={booking?.status === "PENDING" && booking.proposedBy !== side ? "secondary" : "primary"} disabled={pending} onClick={() => setOpen(true)}>
              {booking && booking.status !== "CANCELLED" ? b.proposeNew : b.propose}
            </Button>
          )}
          {live && (
            <Button
              variant="ghost"
              className="text-danger"
              disabled={pending}
              onClick={() => {
                if (window.confirm(b.cancelConfirm)) act(() => cancelBookingAction(requestId));
              }}
            >
              {b.cancel}
            </Button>
          )}
        </div>
      )}

      {canBook && open && (
        <form
          className="flex flex-col gap-3 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => proposeTimeAction(requestId, when, note), () => {
              setOpen(false);
              setWhen("");
              setNote("");
            });
          }}
        >
          <Field id={`when-${requestId}`} label={b.when} hint={b.hoursHint}>
            <Input id={`when-${requestId}`} type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field id={`note-${requestId}`} label={b.note}>
            <Input id={`note-${requestId}`} value={note} maxLength={300} placeholder={b.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="cta" disabled={pending || !when}>
              {b.send}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              ✕
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
