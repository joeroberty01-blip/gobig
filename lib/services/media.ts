import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { deleteObject, putPublicObject } from "@/lib/storage";
import { galleryLimitFor } from "@/lib/services/billing";

// Every upload is decoded and re-encoded on the server: the stored file is always a fresh WebP
// with no EXIF (so no phone GPS coordinates leak — ADR-006), sized for its purpose, whatever the
// browser sent.

export type MediaKind = "LOGO" | "COVER" | "GALLERY";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_GALLERY = 12;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

const SIZES: Record<MediaKind, { width: number; height: number }> = {
  LOGO: { width: 512, height: 512 },
  COVER: { width: 1600, height: 900 },
  GALLERY: { width: 1600, height: 1600 },
};

export type MediaError = "imageInvalid" | "imageTooLarge" | "galleryFull";

export async function processImage(
  input: Buffer,
  kind: MediaKind,
): Promise<{ ok: true; data: Buffer; width: number; height: number } | { ok: false; error: MediaError }> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "imageTooLarge" };
  try {
    // limitInputPixels guards against decompression bombs (tiny file, enormous canvas).
    const image = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) return { ok: false, error: "imageInvalid" };

    const { width, height } = SIZES[kind];
    const { data, info } = await image
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width, height, fit: kind === "COVER" ? "cover" : "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, data, width: info.width, height: info.height };
  } catch {
    return { ok: false, error: "imageInvalid" };
  }
}

/**
 * Stores an image for a provider. A new logo or cover replaces the old one (and its object);
 * gallery images are appended up to the plan's gallery limit (MAX_GALLERY on the free plan).
 */
export async function saveProviderImage(
  providerId: string,
  kind: MediaKind,
  input: Buffer,
): Promise<{ ok: true; id: string } | { ok: false; error: MediaError }> {
  if (kind === "GALLERY") {
    const count = await prisma.mediaAsset.count({ where: { providerId, kind } });
    // Phase 11: paid plans may allow more photos. A lapsed plan keeps existing photos; only new uploads stop.
    if (count >= (await galleryLimitFor(providerId))) return { ok: false, error: "galleryFull" };
  }

  const processed = await processImage(input, kind);
  if (!processed.ok) return processed;

  const key = `providers/${providerId}/${kind.toLowerCase()}-${randomUUID()}.webp`;
  await putPublicObject(key, processed.data, "image/webp");

  const previous =
    kind === "GALLERY" ? null : await prisma.mediaAsset.findFirst({ where: { providerId, kind }, select: { id: true, storageKey: true } });
  const last = kind === "GALLERY" ? await prisma.mediaAsset.findFirst({ where: { providerId, kind }, orderBy: { sortOrder: "desc" } }) : null;

  try {
    const asset = await prisma.$transaction(async (tx) => {
      if (previous) await tx.mediaAsset.delete({ where: { id: previous.id } });
      return tx.mediaAsset.create({
        data: {
          providerId,
          kind,
          storageKey: key,
          width: processed.width,
          height: processed.height,
          bytes: processed.data.byteLength,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
    });
    if (previous) await deleteObject(previous.storageKey).catch(() => undefined);
    return { ok: true, id: asset.id };
  } catch (err) {
    // The row didn't land (e.g. a concurrent logo upload won); don't leave an orphan object.
    await deleteObject(key).catch(() => undefined);
    throw err;
  }
}

export async function deleteProviderImage(providerId: string, assetId: string): Promise<boolean> {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, providerId } });
  if (!asset) return false;
  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  await deleteObject(asset.storageKey).catch(() => undefined);
  return true;
}
