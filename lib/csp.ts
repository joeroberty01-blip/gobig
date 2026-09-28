// Content-Security-Policy (Phase 13, SEC-007). Scripts: only this site's files and Next's own
// inline scripts carrying the per-request nonce ('strict-dynamic' lets those load their chunks).
// Styles allow inline because React style={} attributes and Leaflet use them — a browser ignores
// 'unsafe-inline' when a nonce is present, so styles get no nonce. Images: this site, data:/blob:
// (QR codes, previews), object storage (media + short-lived signed URLs) and the map tile host.

function host(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.replace(/\{[a-z]\}/g, "a")).origin;
  } catch {
    return null;
  }
}

// upgrade-insecure-requests only when the page itself was served over HTTPS (behind the host's TLS);
// on a plain-HTTP local `next start` it would break every asset.
export function buildCsp(nonce: string, isDev = process.env.NODE_ENV !== "production", https = !isDev): string {
  const imageHosts = [process.env.S3_ENDPOINT, process.env.NEXT_PUBLIC_MAP_TILE_URL].map(host).filter((h): h is string => !!h);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${[...new Set(imageHosts)].join(" ")}`.trim(),
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    // Phase C: the push service worker (/sw.js). Needed explicitly: with 'strict-dynamic',
    // script-src ignores 'self', which would otherwise block registering it.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
