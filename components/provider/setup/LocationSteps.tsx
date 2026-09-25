"use client";

import { useState } from "react";
import { Check, LocateFixed } from "lucide-react";
import { saveAreasAction, saveLocationAction } from "@/lib/actions/provider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { Button, Field, Input } from "@/components/ui";
import { MapView, type LatLng } from "@/components/map/MapView";
import { DAR_CENTER, inServiceRegion } from "@/lib/geo";
import { FormError, StepActions, useStepSubmit, type StepProps } from "./shared";

type Place = { id: string; name: string; latitude?: number | null; longitude?: number | null };
export type District = Place & { children: Place[] };
type Visibility = "EXACT" | "APPROXIMATE" | "AREA_ONLY";

const RADIUS_OPTIONS = [2, 5, 10, 20, 30];

export function LocationStep(
  props: StepProps & {
    districts: District[];
    initial: {
      locationId: string | null;
      addressText: string | null;
      visibility: Visibility;
      latitude: number | null;
      longitude: number | null;
      radiusKm: number | null;
    };
  },
) {
  const { t } = useI18n();
  const [locationId, setLocationId] = useState(props.initial.locationId ?? "");
  const [addressText, setAddressText] = useState(props.initial.addressText ?? "");
  const [visibility, setVisibility] = useState<Visibility>(props.initial.visibility);
  const [pin, setPin] = useState<LatLng | null>(
    props.initial.latitude != null && props.initial.longitude != null ? { lat: props.initial.latitude, lng: props.initial.longitude } : null,
  );
  const [radiusKm, setRadiusKm] = useState<number | null>(props.initial.radiusKm);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { submit, pending, error, stepArg } = useStepSubmit(props);

  // Centre the map on the pin, else on the chosen area, else on Dar es Salaam.
  const place = props.districts.flatMap((d) => [d, ...d.children]).find((p) => p.id === locationId);
  const center: LatLng = pin ?? (place?.latitude != null && place.longitude != null ? { lat: place.latitude, lng: place.longitude } : DAR_CENTER);

  const useDevice = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) return setGeoError(t.location.locationUnavailable);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inServiceRegion(p)) return setGeoError(t.location.outsideServiceArea);
        setPin(p);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? t.location.locationDenied : t.location.locationUnavailable);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const options: [Visibility, string, string][] = [
    ["AREA_ONLY", t.profile.fields.visibilityAreaOnly, t.profile.fields.visibilityAreaOnlyHint],
    ["APPROXIMATE", t.location.visibilityApprox, t.location.visibilityApproxHint],
    ["EXACT", t.profile.fields.visibilityExact, t.profile.fields.visibilityExactHint],
  ];

  return (
    <form
      noValidate
      onSubmit={(e) => (
        e.preventDefault(),
        submit(() =>
          saveLocationAction({ locationId, addressText, visibility, latitude: pin?.lat ?? null, longitude: pin?.lng ?? null, radiusKm }, stepArg),
        )
      )}
      className="flex flex-col gap-5"
    >
      <FormError error={error} />
      <Field id="area" label={t.profile.fields.area}>
        <select
          id="area"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base focus:outline-2 focus:outline-brand-500"
        >
          <option value="">{t.profile.fields.chooseArea}</option>
          {props.districts.map((d) => (
            <optgroup key={d.id} label={d.name}>
              {d.children.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value={d.id}>{fill(t.profile.fields.wholeDistrict, { district: d.name })}</option>
            </optgroup>
          ))}
        </select>
      </Field>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t.location.pinTitle}</h2>
        <p className="text-sm text-ink-muted">{t.location.pinHint}</p>
        <MapView center={center} zoom={pin ? 16 : 14} pin={pin} onPinChange={setPin} radiusKm={radiusKm} className="h-64" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className="min-h-10" onClick={useDevice} disabled={locating}>
            <LocateFixed aria-hidden className="size-4" />
            {locating ? t.location.locating : t.location.setPinFromDevice}
          </Button>
          {pin && (
            <Button type="button" variant="ghost" className="min-h-10" onClick={() => setPin(null)}>
              {t.location.clearPin}
            </Button>
          )}
        </div>
        {geoError && <p role="alert" className="text-sm text-danger">{geoError}</p>}
        {!pin && <p className="text-xs text-ink-subtle">{t.location.noPin}</p>}
        {error?.field === "latitude" && <p role="alert" className="text-sm text-danger">{t.errors[error.key]}</p>}
      </section>

      <Field id="address" label={t.profile.fields.address}>
        <Input id="address" value={addressText} onChange={(e) => setAddressText(e.target.value)} maxLength={200} placeholder={t.profile.fields.addressPlaceholder} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t.profile.fields.visibilityTitle}</legend>
        <div className="flex flex-col gap-2">
          {options.map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-2xl border bg-surface p-4 ${visibility === value ? "border-brand-500" : "border-line"}`}
            >
              <input type="radio" name="visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} className="mt-0.5 size-5 accent-brand-700" />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-sm text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {error?.field === "visibility" && <p role="alert" className="mt-2 text-sm text-danger">{t.errors[error.key]}</p>}
      </fieldset>

      <Field id="radius" label={t.location.radiusTitle} hint={t.location.radiusHint}>
        <select
          id="radius"
          value={radiusKm ?? ""}
          onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : null)}
          className="block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base"
        >
          <option value="">{t.location.radiusNone}</option>
          {RADIUS_OPTIONS.map((km) => (
            <option key={km} value={km}>
              {fill(t.location.radiusKm, { km })}
            </option>
          ))}
        </select>
      </Field>
      <StepActions {...props} pending={pending || !locationId} />
    </form>
  );
}

export function AreasStep(props: StepProps & { districts: District[]; initial: string[] }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set(props.initial));
  const { submit, skip, pending, error, stepArg } = useStepSubmit(props);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Choosing a whole district replaces its individual areas, so the list stays short and clear.
  const toggleDistrict = (d: District) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d.id)) next.delete(d.id);
      else {
        next.add(d.id);
        d.children.forEach((a) => next.delete(a.id));
      }
      return next;
    });

  const chip = (on: boolean) =>
    `flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm ${
      on ? "border-brand-500 bg-brand-50 font-semibold text-brand-900" : "border-line bg-surface"
    }`;

  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveAreasAction({ locationIds: [...selected] }, stepArg)))} className="flex flex-col gap-4">
      <FormError error={error} />
      <p className="text-sm font-medium text-brand-700">{fill(t.profile.fields.selectedCount, { count: selected.size })}</p>
      {props.districts.map((d) => {
        const whole = selected.has(d.id);
        return (
          <fieldset key={d.id} className="rounded-2xl border border-line bg-surface p-4">
            <legend className="sr-only">{d.name}</legend>
            <label className={`${chip(whole)} mb-3 w-fit`}>
              <input type="checkbox" className="sr-only" checked={whole} onChange={() => toggleDistrict(d)} />
              {whole && <Check aria-hidden className="size-4" />}
              {fill(t.profile.fields.wholeDistrict, { district: d.name })}
            </label>
            {!whole && (
              <div className="flex flex-wrap gap-2">
                {d.children.map((a) => {
                  const on = selected.has(a.id);
                  return (
                    <label key={a.id} className={chip(on)}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(a.id)} />
                      {on && <Check aria-hidden className="size-4" />}
                      {a.name}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        );
      })}
      <StepActions {...props} pending={pending} onSkip={skip} />
    </form>
  );
}
