// Small, framework-free security helpers shared by route handlers. Unit-tested.

/**
 * True when a state-changing request comes from this site (SEC-005). Browsers always send Origin
 * on cross-site POSTs; when it's absent, Sec-Fetch-Site is used; requests with neither (curl,
 * server-to-server) are allowed through to the normal session/permission checks.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return headers.get("sec-fetch-site") !== "cross-site";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
