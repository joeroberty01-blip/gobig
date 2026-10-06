// Go Big brand assets — words only (owner, 2026-10-06: "kusiwe na icon, just words").
//   npx tsx scripts/brand/icons.ts
// Every image is the wordmark "Go Big" ("Big" in the orange gradient), drawn in the installed Chrome
// so it uses the app's real font (Plus Jakarta Sans). Writes: app/icon.png (browser tab),
// app/apple-icon.png (iPhone), public/icons/* (PWA / Android / TWA, incl. maskable + monochrome +
// notification badge), app/opengraph-image.png + twitter-image.png (link previews), the Play Store
// listing graphics in docs/store/, and transparent wordmark files in design/logo/.
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";

const ROOT = process.cwd();
const CHROME = process.env.QA_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

export const COLORS = { blue: "#2f6bff", indigo: "#3a1fc9", orange: "#ff6a00", amber: "#ffb000", ink: "#0b1b33" };

const FONT = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=block" rel="stylesheet">`;
const BASE_CSS = `*{margin:0;box-sizing:border-box} html,body{overflow:hidden;background:transparent}
  body{font-family:'Plus Jakarta Sans',sans-serif}
  .w{font-weight:800;letter-spacing:-.045em;line-height:.86}
  .big{background:linear-gradient(90deg,${COLORS.amber},${COLORS.orange});-webkit-background-clip:text;background-clip:text;color:transparent;padding:0 .04em .16em 0;margin-bottom:-.16em;display:inline-block;line-height:1}
  .tile{background:linear-gradient(135deg,${COLORS.blue},${COLORS.indigo});position:relative;overflow:hidden}
  .tile::after{content:"";position:absolute;inset:0;background:radial-gradient(70% 70% at 25% 15%,rgba(255,255,255,.25),transparent 70%)}
  .center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1}`;

const doc = (w: number, h: number, body: string, css = "") =>
  `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE_CSS} html,body{width:${w}px;height:${h}px} ${css}</style></head><body>${body}</body></html>`;

type IconKind = "tile" | "square" | "maskable" | "mono";

/**
 * The square app icon: "Go" over "Big". `tile` has rounded corners (transparent outside), `square`
 * fills the canvas (iOS / Play round it themselves), `maskable` keeps the words inside Android's
 * 80% safe circle, `mono` is white words on transparent for themed icons and the status bar.
 */
function iconHtml(size: number, kind: IconKind) {
  const text = kind === "maskable" ? 0.25 : kind === "mono" ? 0.28 : 0.33; // font size as a share of the icon
  const radius = kind === "tile" ? size * 0.28 : 0;
  const bg = kind === "mono" ? "" : "tile";
  const go = kind === "mono" ? "#fff" : "#fff";
  const big = kind === "mono" ? `<span style="color:#fff">Big</span>` : `<span class="big">Big</span>`;
  return doc(
    size,
    size,
    `<div class="${bg}" style="position:absolute;inset:0;border-radius:${radius}px">
       <div class="center w" style="font-size:${Math.round(size * text)}px;color:${go};margin-top:-${Math.round(size * 0.02)}px">
         <span>Go</span>${big}
       </div>
     </div>`,
  );
}

/** Link previews and the Play Store banner: the wordmark large, with the tagline. */
function bannerHtml(w: number, h: number, wordPx: number, tagPx: number, chips: string[]) {
  return doc(
    w,
    h,
    `<div class="tile" style="position:absolute;inset:0">
       <div style="position:absolute;width:${h * 1.5}px;height:${h * 1.5}px;border-radius:50%;right:-${h * 0.98}px;bottom:-${h * 1.2}px;background:${COLORS.orange};opacity:.9;z-index:1"></div>
       <div style="position:absolute;width:${h * 1.5}px;height:${h * 1.5}px;border-radius:50%;right:-${h * 1.05}px;bottom:-${h * 1.27}px;background:${COLORS.indigo};z-index:1"></div>
       <div class="center" style="gap:${Math.round(tagPx * 0.9)}px;text-align:center;color:#fff;z-index:2">
         <div class="w" style="font-size:${wordPx}px;line-height:1">Go <span class="big">Big</span></div>
         <div style="font-size:${tagPx}px;font-weight:600;opacity:.88">Local Services. Global Quality.</div>
         ${chips.length ? `<div style="display:flex;gap:14px;font-size:${Math.round(tagPx * 0.65)}px;font-weight:700">${chips.map((c) => `<span style="border-radius:999px;background:rgba(255,255,255,.15);padding:10px 20px">${c}</span>`).join("")}</div>` : ""}
       </div>
     </div>`,
  );
}

/** The wordmark alone on transparent, for print and partners: one for light backgrounds, one for dark. */
function wordmarkHtml(dark: boolean) {
  return doc(1200, 360, `<div class="center w" style="flex-direction:row;font-size:260px;line-height:1;color:${dark ? "#fff" : COLORS.ink}">Go&nbsp;<span class="big">Big</span></div>`);
}

async function shoot(browser: Browser, html: string, w: number, h: number, file: string, transparent = false) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(ROOT, file), type: "png", omitBackground: transparent });
  await p.close();
}

async function main() {
  for (const d of ["public/icons", "docs/store", "design/logo"]) mkdirSync(join(ROOT, d), { recursive: true });
  // The old icon-based files (replaced by the words).
  for (const f of ["app/icon.svg", "design/logo/go-big-mark.svg", "design/logo/go-big-glyph-white.svg"]) rmSync(join(ROOT, f), { force: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const icons: [number, IconKind, string, boolean][] = [
      [192, "tile", "app/icon.png", true], // browser tab
      [180, "square", "app/apple-icon.png", false], // iPhone home screen
      [192, "tile", "public/icons/icon-192.png", true],
      [512, "tile", "public/icons/icon-512.png", true],
      [192, "maskable", "public/icons/maskable-192.png", false],
      [512, "maskable", "public/icons/maskable-512.png", false],
      [512, "mono", "public/icons/monochrome-512.png", true], // Android 13+ themed icons
      [96, "mono", "public/icons/badge-96.png", true], // notification badge
      [512, "square", "docs/store/play-icon-512.png", false], // Play Store listing icon
    ];
    for (const [size, kind, file, transparent] of icons) await shoot(browser, iconHtml(size, kind), size, size, file, transparent);

    const og = bannerHtml(1200, 630, 190, 42, ["Dar es Salaam", "Go Big AI", "Huduma za karibu"]);
    await shoot(browser, og, 1200, 630, "app/opengraph-image.png");
    await shoot(browser, og, 1200, 630, "app/twitter-image.png");
    await shoot(browser, bannerHtml(1024, 500, 170, 36, []), 1024, 500, "docs/store/feature-graphic-1024x500.png");

    await shoot(browser, wordmarkHtml(false), 1200, 360, "design/logo/go-big-wordmark-light.png", true);
    await shoot(browser, wordmarkHtml(true), 1200, 360, "design/logo/go-big-wordmark-dark.png", true);
  } finally {
    await browser.close();
  }
  console.log("brand assets written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
