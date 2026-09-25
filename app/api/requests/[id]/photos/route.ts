import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/security";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { addRequestPhoto } from "@/lib/services/requests";

// Photo for the customer's own OPEN request (multipart: file). Stored in the PRIVATE bucket,
// re-encoded without EXIF. The service checks the request belongs to the signed-in customer.

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!can(user, "requests:create")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "requestNotFound" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "imageTooLarge" }, { status: 413 });
  if (!(await hit(LIMITS.requestPhotoPerUser, user!.id)).ok) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "imageInvalid" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "imageInvalid" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "imageTooLarge" }, { status: 413 });

  const result = await addRequestPhoto(user!.id, id, Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "requestNotFound" ? 404 : 422 });
  return NextResponse.json({ id: result.photoId }, { status: 201 });
}
