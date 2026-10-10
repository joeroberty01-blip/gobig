// Phase 15 final QA: the customer, provider and admin journeys driven through the real UI in a
// headless Chrome (playwright-core + the installed Chrome; no browser download). Test accounts
// use the @e2e.test.gobig.local domain and are deleted at the end unless --keep is given.
//
//   npx tsx scripts/qa/journeys.ts [--base http://localhost:3001] [--out <dir>] [--only provider,customer,admin] [--keep]
//
// Runs against the database in .env (the app's). Audit rows written by the run stay (SEC-025).
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { base32Decode, hotp, stepAt } from "@/lib/totp";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const BASE = arg("base", "http://localhost:3001");
const OUT = arg("out", join(process.cwd(), "qa-output"));
const ONLY = arg("only", "provider,customer,admin").split(",");
const KEEP = process.argv.includes("--keep");
const CHROME = process.env.QA_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DOMAIN = "@e2e.test.gobig.local";
const PASSWORD = `Qa-${randomBytes(9).toString("base64url")}`;
const run = Date.now().toString(36);

export const DEVICES = {
  phone: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
} as const;
type Device = keyof typeof DEVICES;

type Check = { journey: string; step: string; ok: boolean; note?: string };
const results: Check[] = [];
let shot = 0;

mkdirSync(OUT, { recursive: true });

function log(journey: string, step: string, ok: boolean, note?: string) {
  results.push({ journey, step, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${journey.padEnd(9)} ${step}${note ? ` — ${note}` : ""}`);
}

async function snap(page: Page, name: string) {
  shot += 1;
  await page.screenshot({ path: join(OUT, `${String(shot).padStart(2, "0")}-${name}.png`), fullPage: true }).catch(() => undefined);
}

/** Runs one step; a failure is recorded with a screenshot and the journey continues. */
async function step(page: Page, journey: string, name: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    log(journey, name, true, note ?? undefined);
  } catch (err) {
    log(journey, name, false, (err as Error).message.split("\n")[0]);
    await snap(page, `FAIL-${journey}-${name.replace(/\W+/g, "-")}`);
  }
}

async function newContext(browser: Browser, device: Device, locale: "en" | "sw" = "en"): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...DEVICES[device], baseURL: BASE });
  await ctx.addCookies([{ name: "gobig_locale", value: locale, url: BASE }]);
  return ctx;
}

/** No page may scroll sideways. */
async function noOverflow(page: Page) {
  // Compare with the device's real width: phone browsers widen the layout viewport to fit
  // anything that sticks out, so innerWidth alone can hide an overflow.
  const device = page.viewportSize()!.width;
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (sw > device + 1 || w > device + 1) throw new Error(`page is ${Math.max(sw, w)}px wide on a ${device}px screen`);
}

async function go(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

/** Clicks the wizard's Continue and waits for the next step's URL. */
async function continueTo(page: Page, next: string) {
  await page.getByRole("button", { name: /^(Continue|Save)$/ }).last().click();
  await page.waitForURL(new RegExp(`/provider/setup/${next}|/provider$|/provider\\?`), { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function image(color: string, w = 1200, h = 750): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg({ quality: 80 }).toBuffer();
}

// ─── Provider ───────────────────────────────────────────────────────────────────────────────

const PROVIDER_EMAIL = `qa-provider-${run}${DOMAIN}`;
const BUSINESS = `QA Fundi Bomba ${run}`;
let providerSlug = "";

async function providerJourney(browser: Browser) {
  const J = "provider";
  const ctx = await newContext(browser, "phone");
  const page = await ctx.newPage();

  await step(page, J, "register", async () => {
    await go(page, "/signup?role=provider");
    await page.getByLabel("Your full name").fill("Juma Mfinanga");
    await page.getByLabel("Email").fill(PROVIDER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/provider/, { timeout: 30_000 });
    await noOverflow(page);
  });

  await step(page, J, "create profile: name", async () => {
    await go(page, "/provider/setup/name");
    await page.getByPlaceholder("e.g. Juma AC Services").fill(BUSINESS);
    await continueTo(page, "category");
  });

  await step(page, J, "category", async () => {
    await go(page, "/provider/setup/category");
    await page.getByRole("button", { name: /Home Repairs/ }).click();
    await page.getByRole("radio", { name: "Plumbing" }).click();
    await continueTo(page, "services");
  });

  await step(page, J, "add services", async () => {
    await go(page, "/provider/setup/services");
    await page.getByText("Pipe & leak repair", { exact: true }).click();
    await page.getByText("Drain & toilet unblocking", { exact: true }).click();
    await continueTo(page, "description");
  });

  await step(page, J, "description", async () => {
    await go(page, "/provider/setup/description");
    await page.locator("main textarea").fill("QA test provider: fixing leaking pipes, blocked drains and water tanks around Sinza and Kinondoni. Removed after the QA run.");
    await continueTo(page, "contact");
  });

  await step(page, J, "contact", async () => {
    await go(page, "/provider/setup/contact");
    await page.getByLabel("Phone number").fill(`0713${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`);
    await continueTo(page, "whatsapp");
  });

  await step(page, J, "whatsapp", async () => {
    await go(page, "/provider/setup/whatsapp");
    await page.getByText("Same as my phone number").click();
    await continueTo(page, "online");
  });

  await step(page, J, "online (skipped)", async () => {
    await go(page, "/provider/setup/online");
    await page.getByRole("link", { name: "Skip for now" }).or(page.getByRole("button", { name: "Skip for now" })).first().click();
    await page.waitForURL(/setup\/location/, { timeout: 20_000 });
  });

  await step(page, J, "set location", async () => {
    await go(page, "/provider/setup/location");
    await page.locator("select#area").selectOption({ label: "Sinza" });
    await page.getByText("Only my area").click();
    await continueTo(page, "areas");
  });

  await step(page, J, "service areas", async () => {
    await go(page, "/provider/setup/areas");
    await page.getByText("Mabibo", { exact: true }).click().catch(() => undefined);
    await continueTo(page, "hours");
  });

  await step(page, J, "set availability (hours)", async () => {
    await go(page, "/provider/setup/hours");
    await page.getByText("Open 24 hours").click();
    await continueTo(page, "pricing");
  });

  await step(page, J, "add pricing", async () => {
    await go(page, "/provider/setup/pricing");
    const types = page.locator("main select");
    const n = await types.count();
    if (n < 1) throw new Error("no price selects");
    await types.nth(0).selectOption({ label: "Starting from" });
    await page.locator("main input[inputmode=numeric], main input[type=number]").first().fill("25000");
    for (let i = 1; i < n; i++) await types.nth(i).selectOption({ label: "Ask for price" });
    await continueTo(page, "photos");
  });

  await step(page, J, "add photos (logo, cover, 3 work photos)", async () => {
    await go(page, "/provider/setup/photos");
    const inputs = page.locator("main input[type=file]");
    const count = await inputs.count();
    if (count < 3) throw new Error(`expected 3 upload inputs, found ${count}`);
    // Each upload: wait for the server's answer, then for the new image to appear.
    const upload = async (nth: number, file: Buffer, expect: number) => {
      const done = page.waitForResponse((r) => r.url().includes("/api/provider/media") && r.request().method() === "POST", { timeout: 30_000 });
      await page.locator("main input[type=file]").nth(nth).setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: file });
      const res = await done;
      if (res.status() !== 201) throw new Error(`upload answered ${res.status()}`);
      await page.waitForFunction((n) => document.querySelectorAll("main img").length >= n, expect, { timeout: 20_000 });
    };
    await upload(0, await image("#0a6e53", 600, 600), 1);
    await upload(1, await image("#1c2a44"), 2);
    await upload(2, await image("#b45309"), 3);
    await upload(2, await image("#2563eb"), 4);
    await upload(2, await image("#7c3aed"), 5);
    const imgs = await page.locator("main img").count();
    await continueTo(page, "actions");
    return `${imgs} images`;
  });

  await step(page, J, "contact buttons", async () => {
    await go(page, "/provider/setup/actions");
    for (const label of ["Call", "WhatsApp", "Request quote"]) {
      const box = page.getByRole("checkbox", { name: new RegExp(`^${label}`) });
      if (!(await box.isChecked())) await box.check();
    }
    await continueTo(page, "review");
  });

  await step(page, J, "publish", async () => {
    await go(page, "/provider/setup/review");
    await page.getByRole("button", { name: "Publish profile" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const row = await prisma.provider.findFirst({ where: { members: { some: { user: { email: PROVIDER_EMAIL } } } }, select: { status: true, slug: true } });
    if (row?.status !== "ACTIVE") throw new Error(`status is ${row?.status}`);
    providerSlug = row.slug;
    return row.slug;
  });

  await step(page, J, "dashboard", async () => {
    await go(page, "/provider");
    await page.getByText(/Good (morning|afternoon|evening), Juma/).waitFor();
    await page.getByText("Live — customers can see your profile").waitFor();
    await noOverflow(page);
    await snap(page, "provider-dashboard-phone");
  });

  await step(page, J, "request verification (upload a document)", async () => {
    await go(page, "/provider/verification");
    await page.getByRole("button", { name: "Start" }).click();
    await page.locator("main input[type=file]").first().waitFor({ state: "attached", timeout: 20_000 });
    const done = page.waitForResponse((r) => r.url().includes("/api/provider/verification-docs") && r.request().method() === "POST", { timeout: 30_000 });
    await page.locator("main input[type=file]").first().setInputFiles({ name: "nida.jpg", mimeType: "image/jpeg", buffer: await image("#f6f8fb", 1000, 640) });
    const res = await done;
    if (res.status() !== 201) throw new Error(`document upload answered ${res.status()}`);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const req = await prisma.verificationRequest.findFirst({
      where: { provider: { members: { some: { user: { email: PROVIDER_EMAIL } } } } },
      orderBy: { createdAt: "desc" },
      select: { status: true, _count: { select: { documents: true } } },
    });
    if (req?.status !== "SUBMITTED") throw new Error(`request status is ${req?.status}`);
    return `${req.status}, ${req._count.documents} document`;
  });

  await ctx.storageState({ path: join(OUT, "provider-state.json") });
  await ctx.close();
}

// ─── Customer (phone) + the provider answering (tablet) ────────────────────────────────────

const CUSTOMER_EMAIL = `qa-customer-${run}${DOMAIN}`;
let requestId = "";

async function providerPage(browser: Browser, device: Device) {
  const ctx = await browser.newContext({ ...DEVICES[device], baseURL: BASE, storageState: join(OUT, "provider-state.json") });
  return { ctx, page: await ctx.newPage() };
}

const SECOND = `QA Maji Poa ${run}`;

/** A second live plumber in Sinza, made directly (the UI path is covered by the provider journey). */
async function makeSecondProvider() {
  const profile = await import("@/lib/services/providerProfile");
  const user = await prisma.user.create({ data: { name: "QA Second Owner", email: `qa-second-${run}${DOMAIN}`, passwordHash: "x", role: "PROVIDER" } });
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "pipe-leak-repair" } });
  const { providerId } = await profile.saveBusinessName(user.id, SECOND);
  await profile.saveCategory(providerId, service.categoryId);
  await profile.saveServices(providerId, [service.id]);
  await profile.savePricing(providerId, [{ serviceId: service.id, priceType: "FIXED", priceMin: 30000, priceMax: null, priceUnit: null }]);
  await profile.saveDescription(providerId, "Second QA plumber for the compare check; removed after the QA run.");
  await profile.saveContact(providerId, `0714${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`, null);
  await profile.saveLocation(providerId, { locationId: (await prisma.location.findUniqueOrThrow({ where: { slug: "sinza" } })).id, addressText: null, visibility: "AREA_ONLY" });
  await profile.saveActions(providerId, ["CALL"]);
  const r = await profile.publishProvider(providerId);
  if (!r.ok) throw new Error(`second provider: ${JSON.stringify(r)}`);
}

async function customerJourney(browser: Browser) {
  const J = "customer";
  const ctx = await newContext(browser, "phone");
  const page = await ctx.newPage();
  // Contact buttons open wa.me / tel: — keep the test inside the app.
  await ctx.route(/wa\.me|api\.whatsapp\.com/, (r) => r.fulfill({ status: 204, body: "" }));

  await step(page, J, "register", async () => {
    await go(page, "/signup");
    await page.getByRole("button", { name: /I need services/ }).click();
    await page.getByLabel("Full name").fill("Neema Kweka");
    await page.getByLabel("Email").fill(CUSTOMER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 30_000 });
  });

  await step(page, J, "location (choose area)", async () => {
    await go(page, "/");
    await page.locator("header select").first().selectOption({ label: "Sinza" });
    await page.waitForFunction(() => document.cookie.includes("gobig") || true);
    await page.waitForTimeout(2500);
    await go(page, "/");
    const val = await page.locator("header select").first().inputValue();
    if (val !== "sinza") throw new Error(`area picker shows "${val}"`);
    await noOverflow(page);
    await snap(page, "customer-home-phone");
  });

  // Phase J (2026-10-02): the new home, Go Big AI recommendations, Settings, About and Help.
  await step(page, J, "home search → Go Big AI recommends", async () => {
    await go(page, "/");
    await page.getByRole("heading", { level: 1 }).waitFor();
    // The hero's search is a two-line text box (owner's mockup) that submits on Enter.
    const box = page.locator('form[role="search"] textarea[name="q"]');
    await box.fill("nahitaji fundi bomba");
    await box.press("Enter");
    await page.waitForURL(/\/ask\?/, { timeout: 20_000 });
    await page.getByRole("heading", { name: "Go Big AI recommends" }).waitFor({ timeout: 30_000 });
    const picks = await page.locator("section[aria-labelledby='ai-picks'] ol > li").count();
    if (picks < 1 || picks > 3) throw new Error(`${picks} recommendations`);
    await noOverflow(page);
    await snap(page, "customer-ask-recommends-phone");
    return `${picks} recommended`;
  });

  await step(page, J, "area from the home search reaches Go Big AI", async () => {
    await go(page, "/ask?q=fundi%20bomba&area=sinza");
    // The "understood" chips, not the (hidden) options of the header's area menu.
    await page.locator("section").filter({ has: page.locator("#understood") }).locator("li").filter({ hasText: "Sinza" }).first().waitFor({ timeout: 20_000 });
  });

  await step(page, J, "Go Big AI floating chat", async () => {
    await go(page, "/");
    await page.getByRole("button", { name: "Chat with Go Big AI" }).click();
    const chat = page.getByRole("dialog", { name: "Go Big AI" });
    await chat.getByRole("textbox").fill("nahitaji fundi bomba Sinza");
    await chat.getByRole("textbox").press("Enter");
    await chat.getByText("Here are my top picks:").waitFor({ timeout: 30_000 });
    if (!page.url().endsWith("/")) throw new Error(`the chat navigated to ${page.url()}`);
    await chat.getByRole("link", { name: new RegExp(BUSINESS) }).first().waitFor();
    await noOverflow(page);
    await snap(page, "customer-ai-chat-phone");
    await page.getByRole("button", { name: "Close chat" }).first().click();
  });

  await step(page, J, "settings page", async () => {
    await go(page, "/settings");
    await page.waitForURL(/\/account$/, { timeout: 20_000 });
    await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
    for (const name of ["Profile", "Preferences", "Location", "Security", "Delete account"]) await page.getByRole("heading", { name }).first().waitFor();
    await noOverflow(page);
    await snap(page, "customer-settings-phone");
  });

  await step(page, J, "about and help", async () => {
    await go(page, "/about");
    await page.getByRole("heading", { level: 1, name: "About Go Big" }).waitFor();
    await noOverflow(page);
    await go(page, "/help");
    await page.getByRole("heading", { level: 1, name: "Help" }).waitFor();
    await page.getByText("What is Go Big AI?").click();
    await page.getByText(/never makes up prices/).waitFor();
    await noOverflow(page);
  });

  await step(page, J, "search", async () => {
    // Home now sends typed requests to the AI search; the plain search is under Explore.
    await go(page, "/search");
    await page.getByRole("searchbox").first().fill("fundi bomba");
    await page.getByRole("searchbox").first().press("Enter");
    await page.waitForURL(/\/search\?/, { timeout: 20_000 });
    await page.getByRole("link", { name: BUSINESS }).first().waitFor({ timeout: 20_000 });
    await noOverflow(page);
    await snap(page, "customer-search-phone");
  });

  await step(page, J, "filter", async () => {
    await page.getByRole("link", { name: "Available now" }).click();
    await page.waitForURL(/open=1/);
    await page.getByRole("link", { name: BUSINESS }).first().waitFor({ timeout: 20_000 });
    await page.getByRole("link", { name: "Verified" }).click();
    await page.waitForURL(/verified=1/);
    const shown = await page.getByRole("link", { name: BUSINESS }).count();
    if (shown) throw new Error("an unverified provider appears under Verified");
    await page.getByRole("link", { name: "Clear filters" }).click();
    await page.waitForURL((u) => !u.search.includes("verified"));
    return "available-now keeps it; verified hides it (not verified yet)";
  });

  await step(page, J, "view provider", async () => {
    await page.getByRole("link", { name: BUSINESS }).first().click();
    await page.waitForURL(/\/p\//);
    await page.getByRole("heading", { level: 1, name: new RegExp(BUSINESS) }).waitFor();
    await noOverflow(page);
    await snap(page, "customer-profile-phone");
  });

  await step(page, J, "compare two providers", async () => {
    await makeSecondProvider();
    // Search results are cached for up to PUBLIC_CACHE_SEC (20 s): reload until the new business shows.
    for (let i = 0; i < 6; i++) {
      await go(page, "/search?q=fundi%20bomba");
      if (await page.locator("article").filter({ hasText: SECOND }).count()) break;
      await page.waitForTimeout(5000);
    }
    for (const name of [BUSINESS, SECOND]) {
      const row = page.locator("article").filter({ hasText: name }).first();
      await row.getByRole("button", { name: /Add to compare/ }).click();
    }
    await page.getByRole("link", { name: "Compare 2" }).click();
    await page.waitForURL(/\/compare\?p=/);
    await page.getByRole("heading", { name: "Compare providers" }).waitFor();
    for (const name of [BUSINESS, SECOND]) await page.getByRole("link", { name }).first().waitFor();
    await noOverflow(page);
    await snap(page, "customer-compare-phone");
    await go(page, `/p/${providerSlug}`);
  });

  await step(page, J, "WhatsApp tap is recorded", async () => {
    const before = await prisma.connectEvent.count({ where: { provider: { slug: providerSlug }, action: "WHATSAPP" } });
    const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null), page.getByRole("link", { name: "WhatsApp" }).first().click()]);
    await popup?.close();
    await page.waitForTimeout(2500);
    const after = await prisma.connectEvent.count({ where: { provider: { slug: providerSlug }, action: "WHATSAPP" } });
    if (after !== before + 1) throw new Error(`tap count ${before} -> ${after}`);
  });

  await step(page, J, "call link", async () => {
    const href = await page.getByRole("link", { name: "Call" }).first().getAttribute("href");
    if (!href?.startsWith("tel:+255")) throw new Error(`call link is ${href}`);
  });

  await step(page, J, "favorite", async () => {
    await page.getByRole("button", { name: "Save" }).first().click();
    await page.getByRole("button", { name: "Saved" }).first().waitFor({ timeout: 10_000 });
    await go(page, "/saved");
    await page.getByRole("link", { name: BUSINESS }).first().waitFor({ timeout: 15_000 });
  });

  await step(page, J, "request service", async () => {
    await go(page, `/p/${providerSlug}`);
    await page.getByRole("link", { name: "Request service" }).last().click();
    await page.waitForURL(/\/requests\/new/);
    await page.getByLabel("Describe the job").fill("Bomba la jikoni linavuja tangu jana, naomba fundi aje leo.");
    const area = page.locator("select").filter({ has: page.locator("option", { hasText: "Sinza" }) }).first();
    if (await area.count()) await area.selectOption({ label: "Sinza" }).catch(() => undefined);
    await page.getByRole("button", { name: "Send request" }).click();
    await page.waitForURL(/\/requests\/[a-z0-9]{10,}/, { timeout: 30_000 });
    requestId = page.url().split("/requests/")[1]!.split(/[?#]/)[0]!;
    await noOverflow(page);
    return requestId;
  });

  // The provider answers with a quote, on a tablet.
  const prov = await providerPage(browser, "tablet");
  await step(prov.page, "provider", "receive request and send a quote (tablet)", async () => {
    await go(prov.page, "/provider/requests");
    await prov.page.getByText("Pipe & leak repair").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    await go(prov.page, `/provider/requests/${requestId}`);
    await prov.page.getByLabel("Price (TSh)").fill("35000");
    await prov.page.getByRole("button", { name: "Send quote" }).click();
    await prov.page.getByText("Sent", { exact: true }).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    await prov.page.waitForTimeout(1500);
    const q = await prisma.quote.findFirst({ where: { requestId }, select: { amount: true, status: true } });
    if (!q) throw new Error("no quote saved");
    await noOverflow(prov.page);
    await snap(prov.page, "provider-request-tablet");
    return `${q.amount} TSh, ${q.status}`;
  });
  await step(prov.page, "provider", "message the customer", async () => {
    await prov.page.getByPlaceholder("Write a message…").fill("Habari, naweza kuja saa nane mchana.");
    await prov.page.getByRole("button", { name: "Send", exact: true }).click();
    await prov.page.getByText("naweza kuja saa nane").first().waitFor({ timeout: 15_000 });
  });

  await step(page, J, "choose the provider", async () => {
    await go(page, `/requests/${requestId}`);
    await page.getByText("35,000").first().waitFor({ timeout: 15_000 });
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Choose this provider" }).click();
    await page.getByText("Provider chosen").first().waitFor({ timeout: 15_000 });
  });

  await step(page, J, "mark job done", async () => {
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Mark job as done" }).click();
    await page.getByText("Completed").first().waitFor({ timeout: 15_000 });
  });

  await step(page, J, "review", async () => {
    await go(page, `/p/${providerSlug}`);
    await page.getByRole("radio", { name: "5 stars" }).click();
    await page.locator("#reviews textarea").fill("Fundi alifika kwa wakati na kurekebisha bomba vizuri. Asante!");
    await page.getByRole("button", { name: "Post review" }).click();
    await page.getByText("Verified job").first().waitFor({ timeout: 15_000 });
    const r = await prisma.review.findFirst({ where: { provider: { slug: providerSlug } }, select: { rating: true, verifiedJob: true } });
    if (!r?.verifiedJob) throw new Error("review not marked as a verified job");
    return `${r.rating}★, verified job`;
  });

  await step(prov.page, "provider", "see analytics", async () => {
    await go(prov.page, "/provider/insights");
    await prov.page.getByRole("heading", { level: 1 }).waitFor();
    await go(prov.page, "/provider");
    await noOverflow(prov.page);
    await snap(prov.page, "provider-dashboard-tablet");
  });

  await step(prov.page, "provider", "report the review (for moderation)", async () => {
    await go(prov.page, "/provider/reviews");
    await prov.page.getByRole("button", { name: "Report" }).first().click();
    await prov.page.getByRole("button", { name: "Send report" }).click();
    await prov.page.getByText("our team will look at it").waitFor({ timeout: 15_000 });
    const n = await prisma.reviewReport.count({ where: { review: { provider: { slug: providerSlug } }, status: "OPEN" } });
    if (n !== 1) throw new Error(`${n} open review reports saved`);
  });

  await prov.ctx.close();
  await ctx.close();
}

// ─── Admin (desktop) ────────────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = `qa-admin-${run}${DOMAIN}`;

function totpNow(secret: string, offset = 0) {
  return hotp(base32Decode(secret), stepAt(new Date()) + offset);
}

async function adminJourney(browser: Browser) {
  const J = "admin";
  // A super admin can only be created by another one or the seed script; create it directly.
  await prisma.user.create({ data: { name: "QA Super Admin", email: ADMIN_EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 10), role: "SUPER_ADMIN" } });
  const ctx = await newContext(browser, "desktop");
  const page = await ctx.newPage();
  let secret = "";

  const login = async (otp?: () => string) => {
    await go(page, "/login");
    await page.getByLabel(/Email or phone/).fill(ADMIN_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    if (otp) {
      const field = page.getByLabel(/Authentication code|code/i).first();
      await field.waitFor({ timeout: 20_000 });
      await field.fill(otp());
      await page.getByRole("button", { name: "Log in" }).click();
    }
    await page.waitForURL(/\/admin/, { timeout: 30_000 });
  };

  await step(page, J, "login (password) lands on two-factor set-up", async () => {
    await login();
    await page.waitForURL(/\/admin\/security/, { timeout: 20_000 });
  });

  await step(page, J, "set up two-factor", async () => {
    await page.getByRole("button", { name: "Set up two-factor" }).click();
    await page.getByRole("img", { name: /QR code/ }).waitFor({ timeout: 20_000 });
    const text = await page.locator("main").innerText();
    // The key is shown in groups of four for typing by hand.
    secret = ((text.match(/Key:\s*([A-Z2-7 ]{32,48})/) ?? ["", ""])[1] ?? "").replace(/\s+/g, "").slice(0, 32);
    if (!secret) throw new Error("no manual key shown");
    await page.getByRole("textbox").last().fill(totpNow(secret));
    await page.getByRole("button", { name: "Turn on two-factor" }).click();
    await page.getByText("recovery codes", { exact: false }).first().waitFor({ timeout: 20_000 });
    await snap(page, "admin-2fa-codes");
  });

  await step(page, J, "login with password + code", async () => {
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "gobig_locale", value: "en", url: BASE }]);
    await page.waitForTimeout(31_000); // a new 30-second step, so the enrolment code can't be replayed
    await login(() => totpNow(secret));
    await go(page, "/admin");
    await page.getByRole("heading", { level: 1 }).waitFor();
    if (page.url().includes("/admin/security")) throw new Error("still sent to two-factor set-up");
    await noOverflow(page);
    await snap(page, "admin-overview-desktop");
  });

  await step(page, J, "settings centre", async () => {
    await go(page, "/admin/settings");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.locator("#automation").waitFor();
    await noOverflow(page);
    await snap(page, "admin-settings-desktop");
  });

  // Phase I/J: the Automation Control Center and risk flags.
  await step(page, J, "automation control center (every tab)", async () => {
    for (const tab of ["", "rules", "runs", "failed", "deliveries", "audit"]) {
      await go(page, `/admin/automation${tab ? `?tab=${tab}` : ""}`);
      await page.getByRole("heading", { level: 1, name: "Automation Control Center" }).waitFor({ timeout: 20_000 });
      await noOverflow(page);
      if (!tab || tab === "rules") await snap(page, `admin-automation-${tab || "overview"}`);
    }
    await go(page, "/admin/automation?tab=rules");
    await page.getByRole("heading", { name: "Trust & safety" }).waitFor();
  });

  await step(page, J, "risk flags", async () => {
    await go(page, "/admin/risk");
    await page.getByRole("heading", { level: 1, name: "Risk flags" }).waitFor();
    await noOverflow(page);
  });

  await step(page, J, "weekly and monthly summaries", async () => {
    await go(page, "/admin/analytics");
    await page.getByRole("heading", { name: "Weekly and monthly summaries" }).waitFor({ timeout: 20_000 });
  });

  await step(page, J, "manage providers", async () => {
    await go(page, `/admin/providers?q=${encodeURIComponent(providerSlug)}`);
    await page.getByText(BUSINESS).first().waitFor({ timeout: 15_000 });
  });

  await step(page, J, "verify provider", async () => {
    await go(page, "/admin/verification");
    await page.getByRole("link", { name: new RegExp(BUSINESS) }).first().click();
    await page.waitForURL(/\/admin\/verification\/[a-z0-9]+/);
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByText("Decision saved.").waitFor({ timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const p = await prisma.provider.findUnique({ where: { slug: providerSlug }, select: { verifiedAt: true } });
    if (!p?.verifiedAt) throw new Error("provider not verified");
  });

  await step(page, J, "customer sees the Verified badge and filter", async () => {
    await go(page, "/search?verified=1&q=fundi%20bomba");
    await page.getByRole("link", { name: BUSINESS }).first().waitFor({ timeout: 20_000 });
  });

  await step(page, J, "manage categories", async () => {
    await go(page, "/admin/categories");
    await page.locator("main").getByText("Home Repairs & Maintenance", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
    await noOverflow(page);
  });

  await step(page, J, "moderate reviews (hide, then restore)", async () => {
    await go(page, "/admin/reviews");
    await page.getByRole("button", { name: "Hide review" }).first().click();
    const dialogOk = page.getByRole("button", { name: /Hide review|Confirm/ }).last();
    await page.waitForTimeout(500);
    if (await page.getByRole("textbox").count()) await page.getByRole("textbox").last().fill("QA check: hide then restore.");
    await dialogOk.click().catch(() => undefined);
    await page.waitForTimeout(2000);
    let r = await prisma.review.findFirst({ where: { provider: { slug: providerSlug } }, select: { status: true } });
    if (r?.status !== "HIDDEN") throw new Error(`review status ${r?.status} after hide`);
    await go(page, "/admin/reviews");
    await page.getByRole("button", { name: "Restore" }).first().click();
    if (await page.getByRole("textbox").count()) await page.getByRole("textbox").last().fill("QA check: restored.");
    await page.getByRole("button", { name: "Restore" }).last().click().catch(() => undefined);
    await page.waitForTimeout(2000);
    r = await prisma.review.findFirst({ where: { provider: { slug: providerSlug } }, select: { status: true } });
    if (r?.status !== "PUBLISHED") throw new Error(`review status ${r?.status} after restore`);
  });

  await step(page, J, "manage requests", async () => {
    await go(page, "/admin/requests?status=COMPLETED");
    // Listed under its category; the customer's own description identifies it.
    await page.locator("main").getByText("Bomba la jikoni linavuja").filter({ visible: true }).first().waitFor({ timeout: 15_000 });
  });

  await step(page, J, "featured listings (monetization)", async () => {
    await go(page, "/admin/monetization");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await noOverflow(page);
    return "page and campaign section load; paid plans are unpriced on this database, so a live campaign isn't created (covered by billing integration tests)";
  });

  await step(page, J, "analytics", async () => {
    await go(page, "/admin/analytics");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await noOverflow(page);
    await snap(page, "admin-analytics-desktop");
  });

  await ctx.close();
}

// ─── Main ───────────────────────────────────────────────────────────────────────────────────

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.provider.deleteMany({ where: { members: { some: { user: { email: { endsWith: DOMAIN } } } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  return users.length;
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    if (ONLY.includes("provider")) await providerJourney(browser);
    if (ONLY.includes("customer")) await customerJourney(browser);
    if (ONLY.includes("admin")) await adminJourney(browser);
  } finally {
    await browser.close();
    writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots: ${OUT}`);
    if (!KEEP) console.log(`cleaned ${await cleanup()} test users`);
    await prisma.$disconnect();
    process.exitCode = failed.length ? 1 : 0;
  }
}

void main();

// Referenced by later journeys.
export const _qa = { PASSWORD, bcrypt, base32Decode, hotp, stepAt, providerSlug: () => providerSlug };
