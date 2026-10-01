import type { MetadataRoute } from "next";

// Web app manifest (Phase C): installable app + push, and the basis of the Play Store (TWA) package.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GO BIG",
    short_name: "GO BIG",
    description: "Find trusted services near you in Dar es Salaam.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#0b1b33",
    lang: "sw",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
