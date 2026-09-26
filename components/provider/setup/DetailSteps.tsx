"use client";

import { useState } from "react";
import { saveActionsAction, saveHoursAction, saveOnlineAction, savePricingAction } from "@/lib/actions/provider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { minutesToTime, type PriceType, type SocialPlatform } from "@/lib/provider/format";
import { CONNECT_ACTIONS, type ConnectAction } from "@/lib/provider/connect";
import { Field, Input } from "@/components/ui";
import { FormError, StepActions, useLocalizedName, useStepSubmit, type StepProps } from "./shared";

const SOCIAL: SocialPlatform[] = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "X", "YOUTUBE", "LINKEDIN"];

export function OnlineStep(props: StepProps & { website: string | null; social: { platform: SocialPlatform; url: string }[] }) {
  const { t } = useI18n();
  const [website, setWebsite] = useState(props.website ?? "");
  const [social, setSocial] = useState<Record<SocialPlatform, string>>(
    () => Object.fromEntries(SOCIAL.map((p) => [p, props.social.find((s) => s.platform === p)?.url ?? ""])) as Record<SocialPlatform, string>,
  );
  const { submit, skip, pending, error, stepArg } = useStepSubmit(props);
  const err = (f: string) => (error?.field === f ? t.errors[error.key] : undefined);

  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveOnlineAction({ website, social }, stepArg)))} className="flex flex-col gap-4">
      {error && !error.field && <FormError error={error} />}
      <Field id="website" label={t.profile.fields.website} error={err("website")}>
        <Input id="website" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={t.profile.fields.websitePlaceholder} invalid={!!err("website")} />
      </Field>
      {SOCIAL.map((p) => (
        <Field key={p} id={`social-${p}`} label={t.profile.social[p]} error={err(`social.${p}`)}>
          <Input
            id={`social-${p}`}
            value={social[p]}
            onChange={(e) => setSocial((s) => ({ ...s, [p]: e.target.value }))}
            placeholder={t.profile.fields.socialPlaceholder}
            invalid={!!err(`social.${p}`)}
          />
        </Field>
      ))}
      <StepActions {...props} pending={pending} onSkip={skip} />
    </form>
  );
}

type Day = { day: number; open: boolean; opensAt: string; closesAt: string };

export function HoursStep(
  props: StepProps & {
    mode: "SCHEDULE" | "ALWAYS_OPEN" | "BY_APPOINTMENT";
    note: string | null;
    hours: { dayOfWeek: number; opensAt: number; closesAt: number }[];
  },
) {
  const { t } = useI18n();
  const [mode, setMode] = useState(props.mode);
  const [note, setNote] = useState(props.note ?? "");
  const [days, setDays] = useState<Day[]>(() =>
    [1, 2, 3, 4, 5, 6, 7].map((day) => {
      const row = props.hours.find((h) => h.dayOfWeek === day);
      // Sensible starting point for a new schedule: Mon–Sat 08:00–18:00, Sunday closed.
      const fresh = props.hours.length === 0;
      return {
        day,
        open: row ? true : fresh && day <= 6,
        opensAt: row ? minutesToTime(row.opensAt) : "08:00",
        closesAt: row ? minutesToTime(row.closesAt) : "18:00",
      };
    }),
  );
  const { submit, skip, pending, error, stepArg } = useStepSubmit(props);
  const update = (day: number, patch: Partial<Day>) => setDays((ds) => ds.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  const copyWeekdays = () => {
    const mon = days[0]!;
    setDays((ds) => ds.map((d) => (d.day >= 2 && d.day <= 5 ? { ...d, open: mon.open, opensAt: mon.opensAt, closesAt: mon.closesAt } : d)));
  };
  // Issue path is days.<index>.<day>; days are always sent Monday-first, so index + 1 = day.
  const badDay = error?.key === "hoursInvalid" ? Number(error.field?.split(".")[1]) + 1 : null;

  const modes = [
    ["SCHEDULE", t.profile.fields.modeSchedule],
    ["ALWAYS_OPEN", t.profile.fields.modeAlways],
    ["BY_APPOINTMENT", t.profile.fields.modeAppointment],
  ] as const;

  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveHoursAction({ mode, days, note }, stepArg)))} className="flex flex-col gap-4">
      <FormError error={error} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t.profile.fields.hoursMode}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {modes.map(([value, label]) => (
            <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-surface px-3 text-sm ${mode === value ? "border-brand-500 font-semibold" : "border-line"}`}>
              <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} className="size-4 accent-brand-700" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "SCHEDULE" && (
        <div className="rounded-2xl border border-line bg-surface">
          {days.map((d) => (
            <div key={d.day} className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-0 ${badDay === d.day ? "bg-danger-soft" : ""}`}>
              <label className="flex w-32 items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={d.open} onChange={(e) => update(d.day, { open: e.target.checked })} className="size-5 accent-brand-700" />
                {t.profile.days[d.day - 1]}
              </label>
              {d.open ? (
                <div className="flex items-center gap-2">
                  <input type="time" aria-label={`${t.profile.days[d.day - 1]} ${t.profile.fields.opens}`} value={d.opensAt} onChange={(e) => update(d.day, { opensAt: e.target.value })} className="min-h-10 rounded-lg border border-line px-2 text-sm" />
                  <span aria-hidden>–</span>
                  <input type="time" aria-label={`${t.profile.days[d.day - 1]} ${t.profile.fields.closes}`} value={d.closesAt} onChange={(e) => update(d.day, { closesAt: e.target.value })} className="min-h-10 rounded-lg border border-line px-2 text-sm" />
                </div>
              ) : (
                <span className="text-sm text-ink-subtle">{t.profile.fields.closed}</span>
              )}
            </div>
          ))}
          <div className="px-4 py-3">
            <button type="button" onClick={copyWeekdays} className="text-sm font-medium text-brand-700 hover:underline">
              {t.profile.fields.copyWeekdays}
            </button>
          </div>
        </div>
      )}

      <Field id="hoursNote" label={t.profile.fields.hoursNote}>
        <Input id="hoursNote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t.profile.fields.hoursNotePlaceholder} />
      </Field>
      <StepActions {...props} pending={pending} onSkip={skip} />
    </form>
  );
}

type PriceRow = {
  serviceId: string;
  name: { nameEn: string; nameSw: string };
  priceType: PriceType;
  priceMin: string;
  priceMax: string;
  priceUnit: string;
};

export function PricingStep(
  props: StepProps & {
    services: { serviceId: string; priceType: PriceType; priceMin: number | null; priceMax: number | null; priceUnit: string | null; service: { nameEn: string; nameSw: string } }[];
  },
) {
  const { t } = useI18n();
  const name = useLocalizedName();
  const [rows, setRows] = useState<PriceRow[]>(() =>
    props.services.map((s) => ({
      serviceId: s.serviceId,
      name: s.service,
      priceType: s.priceType,
      priceMin: s.priceMin?.toLocaleString("en-US") ?? "",
      priceMax: s.priceMax?.toLocaleString("en-US") ?? "",
      priceUnit: s.priceUnit ?? "",
    })),
  );
  const { submit, skip, pending, error, stepArg } = useStepSubmit(props);
  const update = (id: string, patch: Partial<PriceRow>) => setRows((rs) => rs.map((r) => (r.serviceId === id ? { ...r, ...patch } : r)));
  const badIndex = error?.field?.startsWith("items.") ? Number(error.field.split(".")[1]) : null;
  const types: PriceType[] = ["ON_QUOTE", "FIXED", "FROM", "RANGE", "HOURLY"];

  return (
    <form noValidate
      onSubmit={(e) => (
        e.preventDefault(),
        submit(() =>
          savePricingAction(
            { items: rows.map(({ serviceId, priceType, priceMin, priceMax, priceUnit }) => ({ serviceId, priceType, priceMin, priceMax, priceUnit })) },
            stepArg,
          ),
        )
      )}
      className="flex flex-col gap-3"
    >
      {rows.map((r, i) => (
        <fieldset key={r.serviceId} className={`rounded-2xl border bg-surface p-4 ${badIndex === i ? "border-danger" : "border-line"}`}>
          <legend className="sr-only">{name(r.name)}</legend>
          <p className="mb-3 font-semibold">{name(r.name)}</p>
          {badIndex === i && error && <p role="alert" className="mb-2 text-sm text-danger">{t.errors[error.key]}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`type-${r.serviceId}`} label={t.profile.fields.priceType}>
              <select
                id={`type-${r.serviceId}`}
                value={r.priceType}
                onChange={(e) => update(r.serviceId, { priceType: e.target.value as PriceType })}
                className="block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base"
              >
                {types.map((pt) => (
                  <option key={pt} value={pt}>
                    {t.profile.priceTypes[pt]}
                  </option>
                ))}
              </select>
            </Field>
            {r.priceType !== "ON_QUOTE" && (
              <Field id={`min-${r.serviceId}`} label={r.priceType === "RANGE" ? t.profile.fields.priceMin : t.profile.fields.priceAmount}>
                <Input id={`min-${r.serviceId}`} inputMode="numeric" value={r.priceMin} onChange={(e) => update(r.serviceId, { priceMin: e.target.value })} placeholder="25,000" />
              </Field>
            )}
            {r.priceType === "RANGE" && (
              <Field id={`max-${r.serviceId}`} label={t.profile.fields.priceMax}>
                <Input id={`max-${r.serviceId}`} inputMode="numeric" value={r.priceMax} onChange={(e) => update(r.serviceId, { priceMax: e.target.value })} placeholder="50,000" />
              </Field>
            )}
            {r.priceType !== "ON_QUOTE" && r.priceType !== "HOURLY" && (
              <Field id={`unit-${r.serviceId}`} label={t.profile.fields.priceUnit}>
                <Input id={`unit-${r.serviceId}`} value={r.priceUnit} maxLength={40} onChange={(e) => update(r.serviceId, { priceUnit: e.target.value })} placeholder={t.profile.fields.priceUnitPlaceholder} />
              </Field>
            )}
          </div>
        </fieldset>
      ))}
      {error && badIndex === null && <FormError error={error} />}
      <StepActions {...props} pending={pending} onSkip={skip} />
    </form>
  );
}

export function ActionsStep(
  props: StepProps & { enabled: ConnectAction[]; available: Record<ConnectAction, boolean>; bookingUrl: string | null; rideUrl: string | null },
) {
  const { t } = useI18n();
  const [bookingUrl, setBookingUrl] = useState(props.bookingUrl ?? "");
  const [rideUrl, setRideUrl] = useState(props.rideUrl ?? "");
  // Booking buttons become selectable as soon as their link is typed; the server re-checks it.
  const available = (a: ConnectAction) =>
    a === "BOOK_SERVICE" ? !!bookingUrl.trim() : a === "BOOK_RIDE" ? !!rideUrl.trim() : props.available[a];
  const [selected, setSelected] = useState<Set<ConnectAction>>(new Set(props.enabled.filter((a) => props.available[a])));
  const { submit, pending, error, stepArg } = useStepSubmit(props);
  const toggle = (a: ConnectAction) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  const chosen = [...selected].filter(available);
  const urlError = (f: string) => (error?.field === f ? t.errors[error.key] : undefined);

  return (
    <form
      noValidate
      onSubmit={(e) => (e.preventDefault(), submit(() => saveActionsAction({ actions: chosen, bookingUrl, rideUrl }, stepArg)))}
      className="flex flex-col gap-3"
    >
      {error && !error.field && <FormError error={error} />}
      {CONNECT_ACTIONS.map((a) => {
        const ok = available(a);
        return (
          <label
            key={a}
            className={`flex min-h-14 items-center gap-3 rounded-2xl border bg-surface px-4 py-2 ${!ok ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
              selected.has(a) && ok ? "border-brand-500" : "border-line"
            }`}
          >
            <input type="checkbox" disabled={!ok} checked={selected.has(a) && ok} onChange={() => toggle(a)} className="size-5 accent-brand-700" />
            <span>
              <span className="block text-sm font-semibold">{t.profile.actions[a]}</span>
              <span className="block text-xs text-ink-subtle">{ok ? t.profile.actions.hints[a] : t.profile.actions.needs[a]}</span>
            </span>
          </label>
        );
      })}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field id="bookingUrl" label={t.profile.actions.bookingUrl} error={urlError("bookingUrl")}>
          <Input id="bookingUrl" inputMode="url" value={bookingUrl} maxLength={500} onChange={(e) => setBookingUrl(e.target.value)} placeholder={t.profile.actions.urlPlaceholder} invalid={!!urlError("bookingUrl")} />
        </Field>
        <Field id="rideUrl" label={t.profile.actions.rideUrl} error={urlError("rideUrl")}>
          <Input id="rideUrl" inputMode="url" value={rideUrl} maxLength={500} onChange={(e) => setRideUrl(e.target.value)} placeholder={t.profile.actions.urlPlaceholder} invalid={!!urlError("rideUrl")} />
        </Field>
      </div>
      <StepActions {...props} pending={pending} disabled={chosen.length === 0} />
    </form>
  );
}
