import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requestPhotoUrl } from "@/lib/services/requests";

// A request photo for the customer, a matched provider or an admin: redirects to a short-lived
// signed URL. Anyone else gets 404 (not 403), so photo ids can't be probed.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ error: "notFound" }, { status: 404 });
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const url = await requestPhotoUrl(user, id);
  if (!url) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
