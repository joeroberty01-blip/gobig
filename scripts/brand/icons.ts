// Go Big brand assets (owner, 2026-10-06): one source for the mark, every size each platform asks for.
//   npx tsx scripts/brand/icons.ts
// Writes: app/icon.svg (favicon), app/apple-icon.png, public/icons/* (PWA / Android / TWA, incl.
// maskable + monochrome), app/opengraph-image.png + twitter-image.png (link previews), and the Play
// Store listing graphics in docs/store/. Big images with text are drawn in the installed Chrome so
// they use the app's real font (Plus Jakarta Sans).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const CHROME = process.env.QA_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

// ─── The mark ───────────────────────────────────────────────────────────────────────────────
// A bold white "G" with an orange arrow launching out of its opening, on a blue→indigo tile.

export const COLORS = { blue: "#2f6bff", indigo: "#3a1fc9", orange: "#ff7a00", amber: "#ffc21a" };

const DEFS = `<defs>
  <linearGradient id="gb-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COLORS.blue}"/><stop offset="1" stop-color="${COLORS.indigo}"/></linearGradient>
  <linearGradient id="gb-spark" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${COLORS.orange}"/><stop offset="1" stop-color="${COLORS.amber}"/></linearGradient>
  <radialGradient id="gb-glow" cx="0.3" cy="0.2" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`;

/** The G and the arrow, drawn in a 64×64 box. */
function glyph(mono = false) {
  const g = mono ? "#fff" : "#fff";
  const a = mono ? "#fff" : "url(#gb-spark)";
  return `<path d="M40.5 21.2 A15.5 15.5 0 1 0 45.5 35 H33" fill="none" stroke="${g}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M41.5 22.5 L51 13" fill="none" stroke="${a}" stroke-width="5.5" stroke-linecap="round"/>
<path d="M43.5 12 H52 V20.5" fill="none" stroke="${a}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Centre of the glyph's drawing, so scaled versions stay optically centred. */
const GX = 33.3;
const GY = 31.8;
const scaled = (s: number, mono = false) => `<g transform="translate(32 32) scale(${s}) translate(${-GX} ${-GY})">${glyph(mono)}</g>`;

type MarkOpts = { shape: "tile" | "square" | "none"; scale?: number; mono?: boolean };
export function markSvg({ shape, scale = 1, mono = false }: MarkOpts): string {
  const bg =
    shape === "tile"
      ? `<rect width="64" height="64" rx="18" fill="url(#gb-tile)"/><rect width="64" height="64" rx="18" fill="url(#gb-glow)"/>`
      : shape === "square"
        ? `<rect width="64" height="64" fill="url(#gb-tile)"/><rect width="64" height="64" fill="url(#gb-glow)"/>`
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${DEFS}${bg}${scale === 1 ? glyph(mono) : scaled(scale, mono)}</svg>`;
}

async function png(svg: string, size: number, file: string, flatten?: string) {
  let img = sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil((size / 64) * 72 * 2)) }).resize(size, size);
  if (flatten) img = img.flatten({ background: flatten });
  await img.png({ compressionLevel: 9 }).toFile(join(ROOT, file));
}

// ─── Big graphics with text (Chrome) ────────────────────────────────────────────────────────

const FONT = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=block" rel="stylesheet">`;

function page(width: number, height: number, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
  *{margin:0;box-sizing:border-box} html,body{width:${width}px;height:${height}px;overflow:hidden}
  body{font-family:'Plus Jakarta Sans',sans-serif;color:#fff;background:linear-gradient(135deg,${COLORS.blue},${COLORS.indigo});position:relative}
  .glow{position:absolute;inset:0;background:radial-gradient(60% 80% at 15% 10%,rgba(255,255,255,.22),transparent 70%)}
  .swoosh{position:absolute;border-radius:50%;opacity:.95}
  .mark{width:var(--m);height:var(--m);filter:drop-shadow(0 18px 40px rgba(10,10,60,.35))}
  .word{font-weight:800;letter-spacing:-.035em;line-height:1}
  .big{background:linear-gradient(90deg,${COLORS.amber},${COLORS.orange});-webkit-background-clip:text;background-clip:text;color:transparent}
  .tag{font-weight:600;opacity:.85}
  .chip{display:inline-flex;align-items:center;gap:10px;border-radius:999px;background:rgba(255,255,255,.14);padding:10px 20px;font-weight:700}
</style></head><body><div class="glow"></div>${body}</body></html>`;
}

function markInline(px: number) {
  return `<img class="mark" style="--m:${px}px" src="data:image/svg+xml;base64,${Buffer.from(markSvg({ shape: "tile" })).toString("base64")}">`;
}

const OG = page(
  1200,
  630,
  `<div class="swoosh" style="width:900px;height:900px;right:-420px;bottom:-560px;background:${COLORS.orange};opacity:.9"></div>
   <div class="swoosh" style="width:900px;height:900px;right:-470px;bottom:-610px;background:${COLORS.indigo}"></div>
   <div style="position:absolute;left:90px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:28px">
     <div style="display:flex;align-items:center;gap:32px">${markInline(170)}<div class="word" style="font-size:132px">Go <span class="big">Big</span></div></div>
     <div class="tag" style="font-size:40px">Local Services. Global Quality.</div>
     <div style="display:flex;gap:14px;font-size:26px"><span class="chip">Dar es Salaam</span><span class="chip">Go Big AI</span><span class="chip">Huduma za karibu</span></div>
   </div>`,
);

const FEATURE = page(
  1024,
  500,
  `<div class="swoosh" style="width:620px;height:620px;right:-360px;bottom:-470px;background:${COLORS.orange};opacity:.9"></div>
   <div class="swoosh" style="width:620px;height:620px;right:-395px;bottom:-505px;background:${COLORS.indigo}"></div>
   <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center">
     <div style="display:flex;align-items:center;gap:26px">${markInline(140)}<div class="word" style="font-size:112px">Go <span class="big">Big</span></div></div>
     <div class="tag" style="font-size:34px">Local Services. Global Quality.</div>
   </div>`,
);

async function shoot(browser: Awaited<ReturnType<typeof chromium.launch>>, html: string, width: number, height: number, file: string) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(ROOT, file), type: "png" });
  await p.close();
}

async function main() {
  mkdirSync(join(ROOT, "public/icons"), { recursive: true });
  mkdirSync(join(ROOT, "docs/store"), { recursive: true });

  // Favicon (browsers): rounded tile, vector.
  writeFileSync(join(ROOT, "app/icon.svg"), markSvg({ shape: "tile" }) + "\n");
  // Source files for designers / printing.
  writeFileSync(join(ROOT, "design/logo/go-big-mark.svg"), markSvg({ shape: "tile" }) + "\n");
  writeFileSync(join(ROOT, "design/logo/go-big-glyph-white.svg"), markSvg({ shape: "none", mono: true }) + "\n");

  // iPhone home screen: full square (iOS rounds it), no transparency.
  await png(markSvg({ shape: "square", scale: 0.86 }), 180, "app/apple-icon.png", COLORS.indigo);
  // PWA / browsers ("any"): the rounded tile with transparent corners.
  await png(markSvg({ shape: "tile" }), 192, "public/icons/icon-192.png");
  await png(markSvg({ shape: "tile" }), 512, "public/icons/icon-512.png");
  // Android adaptive ("maskable"): full bleed, glyph inside the 80% safe circle.
  await png(markSvg({ shape: "square", scale: 0.66 }), 192, "public/icons/maskable-192.png");
  await png(markSvg({ shape: "square", scale: 0.66 }), 512, "public/icons/maskable-512.png");
  // Android 13+ themed icons ("monochrome"): white glyph, the system colours it.
  await png(markSvg({ shape: "none", mono: true, scale: 0.66 }), 512, "public/icons/monochrome-512.png");
  // Notification badge (status bar): white glyph on transparent.
  await png(markSvg({ shape: "none", mono: true, scale: 0.9 }), 96, "public/icons/badge-96.png");
  // Play Store listing icon: 512×512, full square, no transparency (Play rounds it).
  await png(markSvg({ shape: "square", scale: 0.86 }), 512, "docs/store/play-icon-512.png", COLORS.indigo);

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await shoot(browser, OG, 1200, 630, "app/opengraph-image.png");
    await shoot(browser, OG, 1200, 630, "app/twitter-image.png");
    await shoot(browser, FEATURE, 1024, 500, "docs/store/feature-graphic-1024x500.png");
  } finally {
    await browser.close();
  }
  console.log("brand assets written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
