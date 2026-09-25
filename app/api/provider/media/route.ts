import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/security";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { MAX_UPLOAD_BYTES, saveProviderImage, type MediaKind } from "@/lib/services/media";

// Image upload for the signed-in provider's own business. Multipart form: `kind` + `file`.
// A route handler (not a server action) so large bodies get a clear size check up front.

const KINDS: readonly MediaKind[] = ["LOGO", "COVER", "GALLERY"];

export async function POST(req: Request) {
  // SEC-005: refuse cross-site uploads outright.
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!can(user, "provider:edit-own")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const providerId = await getOwnedProviderId(user!.id);
  if (!providerId) return NextResponse.json({ error: "noBusinessYet" }, { status: 409 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: "imageTooLarge" }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "imageInvalid" }, { status: 400 });
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (typeof kind !== "string" || !KINDS.includes(kind as MediaKind) || !(file instanceof File)) {
    return NextResponse.json({ error: "imageInvalid" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "imageTooLarge" }, { status: 413 });

  if (!(await hit(LIMITS.uploadPerProvider, providerId)).ok) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  const result = await saveProviderImage(providerId, kind as MediaKind, Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  revalidatePath("/provider", "layout");
  revalidatePath("/p/[slug]", "page");
  return NextResponse.json({ id: result.id }, { status: 201 });
}
