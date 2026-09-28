import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Action } from "@/lib/permissions";
import { roleHome } from "@/lib/roles";
import { VISITOR_COOKIE } from "@/lib/visitor";
import { buildCsp, newNonce } from "@/lib/csp";
import { createMemoryLimiter, DISCOVERY_PAGE_LIMIT } from "@/lib/memoryLimit";
import { clientIpFrom } from "@/lib/clientIp";

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
  // Phase 17
  { prefix: "/ride", action: "trips:request" },
  { prefix: "/delivery", action: "trips:request" },
  { prefix: "/trips", action: "trips:request" },
];

const GUEST_ONLY = ["/login", "/signup"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Pages where contact buttons appear; visitors get their anonymous id before they can tap. */
const PUBLIC_DISCOVERY = ["/p", "/search", "/c", "/categories", "/ask", "/compare"];

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
function nextWithVisitorId(req: { cookies: { get(name: string): { value: string } | undefined }; headers: Headers }, headers: Headers): NextResponse {
  if (req.cookies.get(VISITOR_COOKIE)) return NextResponse.next({ request: { headers } });
  const id = randomVisitorId();
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

const discoveryLimiter = createMemoryLimiter(DISCOVERY_PAGE_LIMIT);

/**
 * SEC-010: caps requests for public discovery pages per IP. Next hides its router headers from the
 * proxy, so link prefetches can't be told apart and count too — the limit is sized for that.
 */
function discoveryLimited(req: Request): NextResponse | null {
  if (req.method !== "GET") return null;
  const ip = clientIpFrom(req.headers);
  if (ip === "unknown") return null;
  const r = discoveryLimiter.hit(ip);
  if (r.ok) return null;
  return new NextResponse("Too many requests. Please wait a few minutes and try again.", {
    status: 429,
    headers: { "Retry-After": String(r.retryAfterSec), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Adds the Content-Security-Policy to every page response (Phase 13, SEC-007). */
function withCsp(res: NextResponse, csp: string, requestId?: string): NextResponse {
  res.headers.set("Content-Security-Policy", csp);
  if (requestId) res.headers.set("x-request-id", requestId);
  return res;
}

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  // A fresh nonce per request; Next reads it from the request's CSP header and applies it to its
  // own inline scripts.
  const nonce = newNonce();
  const https = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
  const csp = buildCsp(nonce, undefined, https);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  // Phase 16: one id per request, for tying log lines together (kept if a trusted edge set one).
  const requestId = /^[A-Za-z0-9-]{8,64}$/.test(req.headers.get("x-request-id") ?? "") ? req.headers.get("x-request-id")! : crypto.randomUUID();
  headers.set("x-request-id", requestId);
  const next = () => withCsp(NextResponse.next({ request: { headers } }), csp, requestId);

  const area = AREAS.find((a) => matches(pathname, a.prefix));
  const guestOnly = GUEST_ONLY.some((p) => matches(pathname, p));
  if (!area && !guestOnly) {
    const discovery = pathname === "/" || PUBLIC_DISCOVERY.some((p) => matches(pathname, p));
    if (!discovery) return next();
    return discoveryLimited(req) ?? withCsp(nextWithVisitorId(req, headers), csp, requestId);
  }

  const session = req.auth;
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true, status: true, passwordChangedAt: true, deletedAt: true, totpEnabledAt: true },
      })
    : null;
  const signedIn =
    !!user && !user.deletedAt && !!session?.user.authAt && session.user.authAt >= user.passwordChangedAt.getTime();

  if (guestOnly) {
    return signedIn && user.status === "ACTIVE"
      ? NextResponse.redirect(new URL(roleHome(user.role), req.nextUrl))
      : next();
  }

  if (!signedIn) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // A suspended account keeps its session but reaches only public pages (no redirect loop
  // back into its own gated home).
  if (user.status !== "ACTIVE") return NextResponse.redirect(new URL("/", req.nextUrl));
  // Phase 13: admins must set up two-factor, and sign in with it, before using the admin area.
  const mfaPending = (user.role === "ADMIN" || user.role === "SUPER_ADMIN") && !(user.totpEnabledAt && session?.user.mfa === true);
  if (mfaPending && matches(pathname, "/admin") && !matches(pathname, "/admin/security") && !matches(pathname, "/admin/account")) {
    return NextResponse.redirect(new URL("/admin/security", req.nextUrl));
  }
  if (!can(user, area!.action)) {
    return NextResponse.redirect(new URL(roleHome(user.role), req.nextUrl));
  }
  return next();
});

// Every page (for the CSP), but not static files, the image optimizer or API routes.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt|sitemap.xml|api/).*)"],
};
