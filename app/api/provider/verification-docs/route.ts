import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/security";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { addDocument, DOCUMENT_TYPES, MAX_DOC_BYTES, type DocumentType } from "@/lib/services/verification";

// Verification document upload (multipart: requestId, type, file). Stored in the PRIVATE bucket.
// The provider id comes from the session; the service checks the request belongs to it and is editable.

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!can(user, "verification:request")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const providerId = await getOwnedProviderId(user!.id);
  if (!providerId) return NextResponse.json({ error: "noBusinessYet" }, { status: 409 });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_DOC_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "documentTooLarge" }, { status: 413 });
  }
  if (!(await hit(LIMITS.verificationDocPerProvider, providerId)).ok) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "documentInvalid" }, { status: 400 });
  }
  const requestId = form.get("requestId");
  const type = form.get("type");
  const file = form.get("file");
  if (typeof requestId !== "string" || requestId.length > 40 || typeof type !== "string" || !DOCUMENT_TYPES.includes(type as DocumentType) || !(file instanceof File)) {
    return NextResponse.json({ error: "documentInvalid" }, { status: 400 });
  }
  if (file.size > MAX_DOC_BYTES) return NextResponse.json({ error: "documentTooLarge" }, { status: 413 });

  const result = await addDocument(providerId, requestId, type as DocumentType, Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  revalidatePath("/provider/verification");
  return NextResponse.json({ id: result.documentId }, { status: 201 });
}
