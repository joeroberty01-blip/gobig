import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Action } from "@/lib/permissions";
import { roleHome } from "@/lib/roles";
import { VISITOR_COOKIE } from "@/lib/visitor";

// First layer of the permission model (docs/PHASE-0-ARCHITECTURE.md §4). Pages and actions
// check again through lib/session.ts and lib/permissions.ts; this gate only keeps people out of
// areas that aren't theirs.

const AREAS: { prefix: string; action: Action }[] = [
  { prefix: "/admin", action: "admin-area:access" },
  { prefix: "/provider", action: "provider-area:access" },
  { prefix: "/account", action: "account:view" },
  { prefix: "/requests", action: "requests:create" },
  { prefix: "/notifications", action: "notifications:view" },
  { prefix: "/saved", action: "favorites:use" },
];

const GUEST_ONLY = ["/login", "/signup"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Pages where contact buttons appear; visitors get their anonymous id before they can tap. */
const PUBLIC_DISCOVERY = ["/p", "/search", "/c", "/categories", "/ask"];

function randomVisitorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Hands out the anonymous analytics id on page load. If it were first created by a tap beacon,
 * several taps sent at once by a new visitor would each get a different id and be counted as
 * different people. The new id is also added to this request's own cookies, so the page being
 * rendered right now can count the visitor's first view (Phase 10).
 */
function nextWithVisitorId(req: { cookies: { get(name: string): { value: string } | undefined }; headers: Headers }): NextResponse {
  if (req.cookies.get(VISITOR_COOKIE)) return NextResponse.next();
  const id = randomVisitorId();
  const headers = new Headers(req.headers);
  const existing = headers.get("cookie");
  headers.set("cookie", existing ? `${existing}; ${VISITOR_COOKIE}=${id}` : `${VISITOR_COOKIE}=${id}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(VISITOR_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  const area = AREAS.find((a) => matches(pathname, a.prefix));
  const guestOnly = GUEST_ONLY.some((p) => matches(pathname, p));
  if (!area && !guestOnly) {
    const discovery = pathname === "/" || PUBLIC_DISCOVERY.some((p) => matches(pathname, p));
    return discovery ? nextWithVisitorId(req) : NextResponse.next();
  }

  const session = req.auth;
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true, status: true, passwordChangedAt: true, deletedAt: true },
      })
    : null;
  const signedIn =
    !!user && !user.deletedAt && !!session?.user.authAt && session.user.authAt >= user.passwordChangedAt.getTime();

  if (guestOnly) {
    return signedIn && user.status === "ACTIVE"
      ? NextResponse.redirect(new URL(roleHome(user.role), req.nextUrl))
      : NextResponse.next();
  }

  if (!signedIn) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // A suspended account keeps its session but reaches only public pages (no redirect loop
  // back into its own gated home).
  if (user.status !== "ACTIVE") return NextResponse.redirect(new URL("/", req.nextUrl));
  if (!can(user, area!.action)) {
    return NextResponse.redirect(new URL(roleHome(user.role), req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/provider/:path*", "/account/:path*", "/requests/:path*", "/notifications", "/saved", "/login", "/signup", "/", "/p/:path*", "/search", "/ask", "/c/:path*", "/categories"],
};
