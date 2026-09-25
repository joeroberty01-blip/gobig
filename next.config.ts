import type { NextConfig } from "next";

// Images are served from the object-storage endpoint(s). Only this app's media bucket is allowed
// through the image optimizer, so it can't be used to proxy other buckets on the same host.
const storageHosts = [process.env.S3_ENDPOINT, process.env.S3_ENDPOINT_TEST]
  .filter((u): u is string => !!u)
  .map((u) => new URL(u).hostname);
const bucket = process.env.S3_MEDIA_BUCKET || "provider-media";

// Baseline security headers (SECURITY_BACKLOG SEC-006). The CSP only sets directives that can't
// break Next's inline scripts; a full script-src policy with nonces is tracked as SEC-007.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [...new Set(storageHosts)].map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: `/${bucket}/**`,
    })),
    // WebP only: all stored media is WebP already, and AVIF output was the vector for
    // GHSA-2xp9-vwfh-vxw4 (patched in next 16.3.3; kept off as defence in depth, SEC-001).
    formats: ["image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
