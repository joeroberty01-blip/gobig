import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { documentUrlForReviewer } from "@/lib/services/verification";

// Reviewer-only: redirects to a 60-second signed URL for one private document (the view is
// audit-logged). The document itself is never proxied through or cached by the app.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user, "verification:review")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const url = await documentUrlForReviewer(user!.id, id);
  if (!url) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
