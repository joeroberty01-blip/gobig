"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { deleteMediaAction, skipStepAction } from "@/lib/actions/provider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button } from "@/components/ui";
import { StepActions, useStepSubmit, type StepProps } from "./shared";

type ErrorKey = keyof Dictionary["errors"];
type Media = { id: string; kind: "LOGO" | "COVER" | "GALLERY"; url: string; width: number; height: number };


/**
 * Shrinks a photo in the browser before upload (phones produce 5–12 MB images; most users here
 * pay per MB). The server re-encodes anyway, so this is purely to save data and time.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // Format the browser can't decode: let the server decide.
  }
}

function Uploader({
  kind,
  label,
  current,
  aspect,
  onError,
}: {
  kind: "LOGO" | "COVER" | "GALLERY";
  label: string;
  current?: Media;
  aspect: string;
  onError: (e: ErrorKey | null) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, startRemove] = useTransition();

  const upload = async (file: File) => {
    onError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", await shrink(file), "upload.jpg");
      const res = await fetch("/api/provider/media", { method: "POST", body });
      if (!res.ok) onError(((await res.json().catch(() => ({}))) as { error?: ErrorKey }).error ?? "generic");
      router.refresh();
    } catch {
      onError("generic");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = (id: string) =>
    startRemove(async () => {
      const r = await deleteMediaAction(id);
      if (!r.ok) onError(r.error);
      router.refresh();
    });

  return (
    <div>
      <div className={`relative overflow-hidden rounded-2xl border border-dashed border-line bg-canvas ${aspect}`}>
        {current ? (
          <Image src={current.url} alt={label} fill sizes="(max-width: 640px) 100vw, 600px" className="object-cover object-[center_20%]" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-ink-subtle">
            <ImagePlus aria-hidden className="size-6" />
            {busy ? t.profile.fields.uploading : t.profile.fields.upload}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={`${label}: ${t.profile.fields.upload}`}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      {current && (
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="secondary" className="min-h-9 flex-1" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? t.profile.fields.uploading : t.profile.fields.replace}
          </Button>
          <Button type="button" variant="ghost" className="min-h-9" disabled={removing} onClick={() => remove(current.id)} aria-label={`${label}: ${t.profile.fields.remove}`}>
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function PhotosStep(props: StepProps & { media: Media[]; maxGallery: number }) {
  const MAX_GALLERY = props.maxGallery;
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [removing, startRemove] = useTransition();
  const { submit, skip, pending, stepArg } = useStepSubmit(props);
  const logo = props.media.find((m) => m.kind === "LOGO");
  const cover = props.media.find((m) => m.kind === "COVER");
  const gallery = props.media.filter((m) => m.kind === "GALLERY");

  return (
    <form noValidate
      // Photos save as they upload; Continue just records the step.
      onSubmit={(e) => (e.preventDefault(), submit(async () => (stepArg ? skipStepAction(stepArg) : { ok: true })))}
      className="flex flex-col gap-6"
    >
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <p className="text-sm text-ink-muted">{t.profile.fields.photoHint}</p>

      <section className="grid gap-5 sm:grid-cols-[160px_1fr]">
        <div>
          <h2 className="mb-2 text-sm font-semibold">{t.profile.fields.logo}</h2>
          <Uploader kind="LOGO" label={t.profile.fields.logo} current={logo} aspect="aspect-square" onError={setError} />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">{t.profile.fields.cover}</h2>
          <Uploader kind="COVER" label={t.profile.fields.cover} current={cover} aspect="aspect-video" onError={setError} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex justify-between text-sm font-semibold">
          {t.profile.fields.gallery}
          <span className="font-normal text-ink-subtle">{fill(t.profile.fields.galleryCount, { count: gallery.length, max: MAX_GALLERY })}</span>
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {gallery.map((g) => (
            <div key={g.id} className="relative aspect-square overflow-hidden rounded-xl bg-canvas">
              <Image src={g.url} alt="" fill sizes="(max-width: 640px) 33vw, 200px" className="object-cover" />
              <button
                type="button"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    const r = await deleteMediaAction(g.id);
                    if (!r.ok) setError(r.error);
                    router.refresh();
                  })
                }
                aria-label={t.profile.fields.remove}
                className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-black/60 text-white"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          ))}
          {gallery.length < MAX_GALLERY && (
            <Uploader key={gallery.length} kind="GALLERY" label={t.profile.fields.gallery} aspect="aspect-square" onError={setError} />
          )}
        </div>
      </section>

      <StepActions {...props} pending={pending} onSkip={skip} />
    </form>
  );
}
