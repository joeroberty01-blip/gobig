import type { MetadataRoute } from "next";

// Web app manifest: installable app + push, and the basis of the Play Store (TWA) package.
// Icons come from scripts/brand/icons.ts (owner's new mark, 2026-10-06).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Go Big — Local Services",
    short_name: "Go Big",
    description: "Find trusted local services near you in Dar es Salaam. Local Services. Global Quality.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // The launch screen shows the icon on the brand indigo, like the tile.
    background_color: "#3a1fc9",
    theme_color: "#ffffff",
    lang: "sw",
    dir: "ltr",
    categories: ["business", "lifestyle", "shopping", "travel"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
    // Long-press the app icon on Android for these.
    shortcuts: [
      { name: "Go Big AI", short_name: "Go Big AI", url: "/ask?source=shortcut", icons: [{ src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Huduma / Services", short_name: "Huduma", url: "/categories?source=shortcut", icons: [{ src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Maombi yangu / My requests", short_name: "Maombi", url: "/requests?source=shortcut", icons: [{ src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
