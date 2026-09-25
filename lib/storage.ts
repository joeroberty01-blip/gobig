import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// S3-compatible object storage (Neon Object Storage, public_read media bucket). Only object keys
// are stored in the database; URLs are built here so each environment points at its own storage.

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
    if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error("Object storage is not configured (S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY).");
    }
    client = new S3Client({
      region: S3_REGION || "eu-central-1",
      endpoint: S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

function bucket(): string {
  return process.env.S3_MEDIA_BUCKET || "provider-media";
}

export async function putPublicObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are unique per upload, so the object never changes and can be cached forever.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export function mediaUrl(key: string): string {
  const base = (process.env.S3_ENDPOINT || "").replace(/\/+$/, "");
  return `${base}/${bucket()}/${key}`;
}

// ─── Private bucket (verification documents) ────────────────────────────────────────────────
// Not publicly readable: objects are only reachable through signed URLs that expire quickly.

function privateBucket(): string {
  return process.env.S3_PRIVATE_BUCKET || "verification-docs";
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "private, no-store",
      // Viewed inline by admins, but always from the storage host — never our app's origin — so a
      // hostile PDF/image can't script the app or read its cookies.
      ContentDisposition: "inline",
    }),
  );
}

export async function deletePrivateObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: privateBucket(), Key: key }));
}

/** Short-lived read URL for one private object. Callers must authorise the viewer first. */
export async function signedPrivateUrl(key: string, expiresInSec = 60): Promise<string> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: privateBucket(), Key: key }), { expiresIn: expiresInSec });
}
