"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { createRequestAction } from "@/lib/actions/requests";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];
type Named = { id: string; nameEn: string; nameSw: string };
type CategoryOption = Named & { services: Named[] };
type District = { id: string; name: string; children: { id: string; name: string }[] };

const MAX_PHOTOS = 5;
const CONTACTS = ["IN_APP", "CALL", "WHATSAPP", "SMS"] as const;
const control = "block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base focus:outline-2 focus:outline-brand-500";
const textarea = "block w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base focus:outline-2 focus:outline-brand-500";

/**
 * "What service do you need?" One form for both an open request (matched to providers) and a
 * direct one (Request Quote on a profile → only that provider). Photos upload after the request
 * exists, to the private bucket.
 */
export function RequestForm({
  categories,
  districts,
  initial,
  target,
  today,
}: {
  categories: CategoryOption[];
  districts: District[];
  initial: { categoryId: string; serviceId: string; locationId: string };
  /** Direct request: the provider, and the services they list (the only ones offered). */
  target: { slug: string; name: string; categoryId: string | null; services: (Named & { categoryId: string })[] } | null;
  /** Today in Dar es Salaam (YYYY-MM-DD), from the server. */
  today: string;
}) {
  const { t, locale } = useI18n();
  const r = t.requests.new;
  const name = (x: Named) => (locale === "sw" ? x.nameSw : x.nameEn);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stage, setStage] = useState<"idle" | "sending" | "uploading">("idle");
  const [error, setError] = useState<{ key: ErrorKey; field?: string } | null>(null);

  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState(initial.locationId);
  const [addressText, setAddressText] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [contactPreference, setContact] = useState<(typeof CONTACTS)[number]>("IN_APP");
  const [photos, setPhotos] = useState<File[]>([]);

  const services = useMemo(
    () => (target ? target.services : (categories.find((c) => c.id === categoryId)?.services ?? [])),
    [target, categories, categoryId],
  );

  const fieldError = (field: string) => (error?.field === field ? (t.errors[error.key] ?? t.errors.generic) : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setError(null);
      setStage("sending");
      const chosenService = target?.services.find((s) => s.id === serviceId);
      const res = await createRequestAction({
        categoryId: target ? (chosenService?.categoryId ?? target.categoryId ?? "") : categoryId,
        serviceId,
        description,
        locationId,
        addressText,
        preferredDate: preferredDate || null,
        preferredTime: preferredTime || null,
        budgetMin,
        budgetMax,
        contactPreference,
        targetProviderSlug: target?.slug ?? null,
      });
      if (!res.ok) {
        setStage("idle");
        return setError({ key: res.error, field: res.field });
      }
      let photoFailed = false;
      if (photos.length) {
        setStage("uploading");
        for (const file of photos) {
          const body = new FormData();
          body.set("file", file);
          const up = await fetch(`/api/requests/${res.requestId}/photos`, { method: "POST", body }).catch(() => null);
          if (!up?.ok) photoFailed = true;
        }
      }
      router.push(`/requests/${res.requestId}${photoFailed ? "?photo=failed" : ""}`);
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {error && !error.field && <Alert>{t.errors[error.key] ?? t.errors.generic}</Alert>}

      {!target && (
        <Field id="category" label={r.category} error={fieldError("categoryId")}>
          <select
            id="category"
            value={categoryId}
            onChange={(e) => (setCategoryId(e.target.value), setServiceId(""))}
            className={control}
          >
            <option value="">{r.chooseCategory}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {(target || categoryId) && (
        <Field id="service" label={r.service}>
          <select id="service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={control}>
            <option value="">{r.anyService}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {name(s)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field id="description" label={r.description} hint={r.descriptionHint} error={fieldError("description")}>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder={r.descriptionPlaceholder}
          className={textarea}
        />
      </Field>

      <Field id="area" label={r.area} error={fieldError("locationId")}>
        <select id="area" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={control}>
          <option value="">{r.chooseArea}</option>
          {districts.map((d) => (
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

      <Field id="address" label={r.address} hint={r.addressHint} error={fieldError("addressText")}>
        <Input id="address" value={addressText} onChange={(e) => setAddressText(e.target.value)} maxLength={200} autoComplete="street-address" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="date" label={r.date} error={fieldError("preferredDate")}>
          <Input id="date" type="date" min={today} value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
        </Field>
        <Field id="time" label={r.time} error={fieldError("preferredTime")}>
          <Input id="time" type="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{r.budget}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Input aria-label={r.budgetMin} placeholder={r.budgetMin} inputMode="numeric" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          <Input aria-label={r.budgetMax} placeholder={r.budgetMax} inputMode="numeric" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
        </div>
        {(fieldError("budgetMin") || fieldError("budgetMax")) && (
          <p role="alert" className="text-sm text-danger">
            {fieldError("budgetMin") ?? fieldError("budgetMax")}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{r.contact}</legend>
        <div className="grid grid-cols-2 gap-2">
          {CONTACTS.map((c) => (
            <label
              key={c}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${
                contactPreference === c ? "border-brand-500 bg-brand-50 font-semibold" : "border-line bg-surface"
              }`}
            >
              <input type="radio" name="contact" value={c} checked={contactPreference === c} onChange={() => setContact(c)} className="accent-brand-700" />
              {r[`contact${c}`]}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-sm text-ink-subtle">{r.contactHint}</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{fill(r.photos, { max: MAX_PHOTOS })}</legend>
        <div className="flex flex-wrap gap-2">
          {photos.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-lg border border-line bg-canvas py-1 pr-1 pl-2 text-xs">
              <span className="max-w-32 truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`${r.removePhoto} ${f.name}`}
                onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                className="grid size-7 place-items-center rounded hover:bg-surface"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-sm text-ink-muted hover:bg-canvas">
              <ImagePlus aria-hidden className="size-4" />
              {r.addPhoto}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <p className="mt-1.5 text-sm text-ink-subtle">{r.photosHint}</p>
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {stage === "uploading" ? r.uploading : pending ? r.sending : r.submit}
      </Button>
    </form>
  );
}
