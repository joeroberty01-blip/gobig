import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONNECT_ACTIONS } from "@/lib/provider/connect";
import { getCurrentUser } from "@/lib/session";
import { isSameOrigin } from "@/lib/security";
import { hit, LIMITS } from "@/lib/services/rateLimit";
import { recordConnect } from "@/lib/services/connectEvents";
import { VISITOR_COOKIE, VISITOR_ID_PATTERN } from "@/lib/visitor";

// Contact-button tap beacon (navigator.sendBeacon). Always answers 204 so it never delays or
// breaks the tap itself and never reveals whether anything was recorded.

const bodySchema = z.object({
  provider: z.string().regex(/^[a-z0-9-]{1,80}$/),
  action: z.enum(CONNECT_ACTIONS),
  source: z.enum(["PROFILE", "CARD", "MAP"]),
});

export async function POST(req: Request) {
  const done = new NextResponse(null, { status: 204 });
  if (!isSameOrigin(req.headers)) return done;

  const raw = await req.text();
  if (raw.length > 512) return done;
  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return done;
  }
  if (!parsed.success) return done;

  // Anonymous random visitor id (httpOnly). Only its salted daily hash is ever stored.
  const jar = await cookies();
  let visitorId = jar.get(VISITOR_COOKIE)?.value;
  if (!visitorId || !VISITOR_ID_PATTERN.test(visitorId)) {
    visitorId = randomBytes(18).toString("base64url");
    done.cookies.set(VISITOR_COOKIE, visitorId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  if (!(await hit(LIMITS.connectPerVisitor, visitorId)).ok) return done;

  const viewer = await getCurrentUser();
  await recordConnect({ slug: parsed.data.provider, action: parsed.data.action, source: parsed.data.source, visitorId, viewer });
  return done;
}
