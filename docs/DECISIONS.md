# Architecture Decision Log

Short records of decisions that shape the codebase. Newest last. Each entry: context,
decision, consequence.

## ADR-001 — New repository, stack copied from the ERP (2026-09-24)

**Context.** The brief says to inspect the existing project and not replace working
architecture. The working directory at the time (`LOLNBYMFUMO`) is an unrelated spare-parts
ERP, so building inside it would have meant tearing out its schema and roles.
**Decision.** GO BIG is its own repo (`Projects/go-big`), using the ERP's proven stack:
Next.js 16, TypeScript strict, Tailwind v4, Prisma 7 + adapter-pg, PostgreSQL, NextAuth v5,
Zod.
**Consequence.** Patterns (proxy gating, DAL/DTOs, self-checking server actions, i18n,
SMS gateway) are re-implemented here, not imported; the ERP is untouched.

## ADR-002 — PWA instead of a native app (2026-09-24)

**Context.** Mobile-first, Dar es Salaam, customers often arrive via a shared WhatsApp link.
**Decision.** One Next.js app, installable as a PWA. No Expo/native app for now.
**Consequence.** One codebase for customers, providers and admins. If a native app is
needed later, route handlers under `/api` become its API; data access is already layered.

## ADR-003 — Provider split into Provider + ProviderProfile + ProviderMember (2026-09-24)

**Context.** The brief lists Providers and Provider Profiles as separate entities.
**Decision.** `Provider` = the business and its admin-controlled state (status,
verification level, ownership). `ProviderProfile` = public content the provider edits.
`ProviderMember` links users to a provider (OWNER/STAFF).
**Consequence.** Provider-editable forms can never write admin fields; a business can gain
extra logins without a migration.

## ADR-004 — Trust and paid visibility never share a score (2026-09-24)

**Context.** Rules: VERIFIED ≠ PAID, FEATURED ≠ VERIFIED, never mix paid ranking with
trust ranking.
**Decision.** Verification and reviews feed the organic ranking only. Paid products
(featured, sponsored category) live in separate tables and render only in slots labelled
as promoted.
**Consequence.** Enforced by schema shape, not by convention.

## ADR-005 — Prices are optional and never estimated (2026-09-24)

**Decision.** `ProviderService.priceType` includes `ON_QUOTE`; missing prices display as
"Ask for price". No generated, averaged or AI-produced prices anywhere.

## ADR-006 — Location privacy by default (2026-09-24)

**Decision.** Exact provider coordinates stay server-side; public output is exact,
rounded, or area-only per the provider's `locationVisibility` (default: area-only for
home-based providers). Customer location is used per request, not stored unless saved.

## ADR-007 — Postgres-native search and geo before any external service (2026-09-24)

**Decision.** Full-text + trigram search and PostGIS on Neon. No Elasticsearch/Algolia
until measured need.

## ADR-008 — Money as integer TZS (2026-09-24)

**Decision.** All amounts `Int` in TZS; formatting happens at display time.


## ADR-009 — Phase 0 open questions resolved with defaults (2026-09-24)

Approved by the user ("next"): login by phone **or** email + password; reset by email, with
SMS used automatically for phone-only accounts once SMSGate is configured; Swahili first with an
English toggle; Vercel + Neon. Neon project `go-big` is in **aws-eu-central-1 (Frankfurt)**,
the closest Neon region to Dar es Salaam — deploy Vercel functions to `fra1` to match.

## ADR-010 — One login for every role; sessions checked against the database (2026-09-24)

**Decision.** A single Credentials provider (`identifier` = email or phone). Role decides the
landing page (`/continue`), not the form. The JWT carries `authAt`; `proxy.ts` and
`lib/session.ts` re-read role/status/`passwordChangedAt` on every gated request.
**Consequence.** Suspension and role changes apply immediately; a password reset logs out every
other session. Cost: one indexed user lookup per gated request.

## ADR-011 — Integration tests run on a separate Neon branch (2026-09-24)

**Decision.** `DATABASE_URL_TEST` points at the Neon `test` branch; the test setup refuses to
run if it is missing or equal to `DATABASE_URL`. Tests create rows under unique per-run
prefixes and delete them afterwards.

## ADR-012 — Seeds are insert-only and contain no business data (2026-09-24)

**Decision.** `db:seed:catalog` inserts categories, services and Dar es Salaam areas only where
the slug is missing, so admin edits survive re-runs. No providers, prices or reviews are ever
seeded. `db:seed:super-admin` reads credentials from env vars only; there is no `db:seed`
script that could create a known-password admin.

## ADR-013 — Photos in Neon Object Storage (2026-09-24)

**Context.** Phase 2 needs logo, cover and gallery images.
**Decision.** Neon Object Storage (S3-compatible, same project and Frankfurt region as the
database). Bucket `provider-media` is `public_read` on both the `main` and `test` branches; each
branch has its own storage, so tests never touch real photos. Only object keys are stored in
`MediaAsset`; URLs are built from `S3_ENDPOINT`. `next/image` may only optimise that bucket.
**Consequence.** No new vendor or account. Swappable for any S3 provider by changing env vars.

## ADR-014 — Every upload is re-encoded on the server (2026-09-24)

**Decision.** The browser shrinks photos first (saves customers' mobile data); the server then
decodes with `sharp`, accepts only JPEG/PNG/WebP, caps size (5 MB) and pixel count, auto-rotates,
resizes per purpose, and writes a fresh WebP **with no EXIF** — phone GPS coordinates never
reach storage (ADR-006). One logo and one cover per provider (DB partial unique indexes);
gallery capped at 12.

## ADR-015 — Publishing rules (2026-09-24)

**Decision.** A provider publishes (DRAFT → ACTIVE) themselves once name, category, ≥1 service,
a 30+ character description, phone, location and ≥1 contact button exist. No admin approval
before listing — verification is a separate, later trust signal (Phase 5, VERIFIED ≠ LISTED).
While ACTIVE, an edit that would remove a required item is rolled back
(`requiredWhilePublished`). The public URL (slug) is frozen at first publish. Suspended
providers can't publish or unpublish themselves.

## ADR-016 — "Ask for price" is never penalised (2026-09-24)

**Context.** Completion % initially counted only services with an amount, which nudged
providers to invent prices to reach 100%.
**Decision.** `ProviderService.pricedAt` records that the provider set the price — an amount or
a deliberate ON_QUOTE. Completion counts that.

## ADR-017 — Contact buttons only when the data exists (2026-09-24)

**Decision.** Providers choose which buttons appear (CALL, WHATSAPP, WEBSITE, EMAIL, DIRECTIONS).
A button can only be enabled when its data exists; removing the data removes the button.
DIRECTIONS requires the street address to be public. The public page receives prebuilt links
only, so contact details for switched-off buttons never reach the browser. Phase 6 adds the
remaining actions and click tracking.

## ADR-018 — Discovery search in Postgres with pg_trgm (2026-09-24)

**Decision.** Text search matches service names, Swahili/English keywords and (sub)category
names, plus business names. Exact whole-word hits score 1; otherwise `word_similarity` with a
threshold of **0.55**, chosen from measurements (real typos ≥ 0.7; unrelated phrases sharing one
word = 0.5). Multi-word queries must match **every** meaningful word (filler words like "in",
"kwa", "wa" ignored), or the exact phrase. Words under 4 letters ("AC", "TV") match exactly only
— fuzzy scores for them are noise (measured 0.67 against unrelated services). Trigram GIN
indexes back it. No external search service (ADR-007).

## ADR-019 — Area-based location until the location engine (2026-09-24)

**Decision.** Phase 3 location = the area the customer picks (cookie, works for guests) or an
area name typed into the query ("fundi AC Mikocheni"). Results within an area are tiered:
based in the area → serves it (service areas, incl. whole district) → elsewhere in the same
district; other districts are excluded. `area=all` means "everywhere". Device location,
distances and maps are Phase 4.

## ADR-020 — Phase 3 ordering and honest cards (2026-09-24)

**Decision.** Order = text relevance (bucketed) → area tier → open now → longest listed. No paid
or trust signals yet (Phase 8 ranking; ADR-004). Cards show only provider data: the searched
service's own price or "Ask for price", open/closed from the provider's own hours in Dar time
(nothing shown when hours are unknown), "No reviews yet" instead of any rating, and no
verification badge until Phase 5 verifies someone. "Popular services" = real counts of live
providers. The "Featured" home section is omitted until paid placements exist (Phase 11).
Ranking runs in memory over ≤ 500 candidates; Phase 13 moves it into SQL if needed.

## ADR-021 — Area centres from OpenStreetMap; no invented coordinates (2026-09-24)

**Decision.** Area centres were geocoded once from OpenStreetMap Nominatim (exact name match,
place/ward results only, inside Dar es Salaam, district cross-checked) and committed with source
and ODbL attribution in `prisma/seeds/data/dar-area-coordinates.json`. 42 of 47 areas found;
Bunju, Mbezi Beach, Tegeta, Kibada and Mjimwema were not in OSM under those names and are left
**empty rather than guessed** (distance falls back to "unknown" for providers there). District
centres = mean of their areas. The geocoder's district for every found area matched the Phase 1
district assignments. The seed only fills empty coordinates, so admin corrections survive.

## ADR-022 — Distance without PostGIS (amends ADR-007) (2026-09-24)

**Decision.** For one city, plain `latitude`/`longitude` columns with a composite index, an
index-friendly bounding-box prefilter, and exact haversine distances in code are enough.
PostGIS is deferred until multi-city scale or polygon service areas need it; the columns map
directly onto a future `geography(Point)`.

## ADR-023 — Location privacy precision (2026-09-24)

**Decision.** Providers choose EXACT (pin + address public), APPROXIMATE (pin snapped to a fixed
~550 m grid, so repeated readings can't triangulate it) or AREA_ONLY (area centre only). Only
this *public point* ever leaves the server — on cards, maps, profiles and in distances, which are
stated no more precisely than the point ("0.3 km" vs "~3 km"). Travel-radius coverage is also
computed from the public point (SEC-020). Map popups are built with `textContent`, never HTML.
Customer position: requested only on tap, rounded to ~110 m, kept in an httpOnly cookie for one
day, never stored in the database or shown to providers; choosing an area clears it.

## ADR-024 — Phase 4 ranking order (2026-09-24)

**Decision.** relevance → service-area match (based in area / serves it via areas or travel
radius / same district) → distance band (≤2, ≤5, ≤10, ≤20, >20 km, unknown) → available now →
longest listed. Never distance alone: a nearby provider that doesn't do the job or doesn't serve
the customer ranks below one that does. With a shared position and no chosen area, results are
providers within 15 km or serving the customer.

## ADR-025 — Map tiles (2026-09-24)

**Decision.** Leaflet with a configurable tile URL (`NEXT_PUBLIC_MAP_TILE_URL`). OpenStreetMap's
public tiles are used in development only; production must use a tile provider with an API key
and acceptable usage terms (SEC-021).

## ADR-026 — Verification is admin-decided, configurable, and never purchasable (2026-09-24)

**Decision.** Providers open one request at a time (partial unique index) for an active
`VerificationLevel`, attach documents, and submit once every required document type is present.
Only ADMIN/SUPER_ADMIN decide (approve / reject / request changes; a note is required for the last
two). The status check happens inside the update, so concurrent decisions can't both win.
Approval sets `Provider.verificationLevelId` — a field no provider-facing code path writes — and
never downgrades a higher tier. Tiers (names, rank, required documents, active) are editable by
SUPER_ADMIN only; deactivating a tier keeps existing badges. Two default tiers are seeded as
platform configuration: identity (rank 1, any ID document) and business (rank 2, licence + TIN).

## ADR-027 — Verification documents in a private bucket (2026-09-24)

**Decision.** Separate `verification-docs` bucket with no public read (anonymous GET = 403,
tested). Images are re-encoded to JPEG (EXIF/GPS stripped); PDFs accepted only with a real PDF
header; 10 MB cap; random object keys, never user filenames. Reviewers open documents through a
reviewer-only route that audit-logs the view and redirects to a 60-second signed URL — documents
are never proxied through, cached by, or served from the app's origin.

## ADR-028 — Reviews: who, how many, and moderation (2026-09-24)

**Decision.** Only CUSTOMER accounts review; never a business they're a member of; one review per
customer per provider (unique; editing replaces it); only live providers. Reviews publish
immediately (post-moderation) and can be reported by customers and providers (not your own, not
twice). Admins hide/restore/dismiss; hiding recalculates the rating and a hidden review can't be
un-hidden by editing it. Provider replies are separate rows, so a reply can never alter the review.
Public reviewer names are "First L." only. `Provider.ratingAvg/ratingCount` are recomputed from
PUBLISHED reviews inside the same transaction as every change. Until Phase 7 there's no proof of a
completed job, so reviews aren't marked as "verified purchase"; that link comes with requests.

## ADR-029 — Trust indicators (2026-09-24)

**Decision.** Four independent signals, none implied by another and none purchasable: VERIFIED
(admin-approved level), TOP RATED (≥ 4.5 average from ≥ 5 published reviews), AVAILABLE NOW
(provider's own hours), FAST RESPONSE (median first response ≤ 60 min — **not shown until Phase 7
provides response data**). Paid placement (Phase 11) will be a separate labelled "Featured /
Sponsored" marker. Ranking does not use these yet (Phase 8).

## ADR-030 — Append-only audit log (2026-09-24)

**Decision.** `AuditLog` rows are written for admin creation, every verification step (including
each document view) and every moderation action. DB triggers reject UPDATE and DELETE. `actorId`
is deliberately not a foreign key, so deleting a user can never rewrite history (a FK with
SET NULL would itself be an update the trigger must refuse). Metadata holds ids/slugs/short notes
only — never secrets, tokens or document contents.

## ADR-031 — Rate limiting (closes most of SEC-010) (2026-09-24)

**Decision.** Postgres fixed-window counters, one atomic upsert per check; keys are SHA-256 hashes
(no emails/phones/IPs stored). Limits: login 10/15 min per identifier + 50/15 min per IP
(reset on success), sign-up 10/h per IP, reset request 10/h per IP, reviews 10/day, reports
30/day, replies 60/day per user, photo uploads 60/h and verification documents 40/h per provider.
Search is not limited yet (tracked).

## ADR-032 — The nine contact buttons (2026-09-24)

**Decision.** Providers choose from CALL, WHATSAPP, MESSAGE (SMS), REQUEST_QUOTE, BOOK_SERVICE,
BOOK_RIDE, WEBSITE, EMAIL, DIRECTIONS; only chosen buttons whose data exists are shown, in a
fixed order. BOOK_SERVICE / BOOK_RIDE open a link the provider supplies (validated like the
website: http/https only, no credentials — never `javascript:`/`data:`). MESSAGE is SMS until
in-app messaging exists (Phase 7). WhatsApp/SMS open with a short "found you on GO BIG" greeting.
Removing the data behind a button switches it off automatically.

## ADR-033 — Request Quote without storing requests (2026-09-24) — superseded by ADR-035

**Context.** Phase 7 builds in-app service requests, quotes and messaging; building a quote inbox
now would be Phase 7 early.
**Decision.** Request Quote opens a short form (service, details, area, timing) that composes a
message and hands it to the provider's own channel — WhatsApp, else SMS, else email. The customer
sends it themselves; GO BIG stores nothing but the anonymous tap. The channel's contact detail is
exposed only when the provider switched Request Quote on. Phase 7 will replace this with in-app
requests.

## ADR-034 — Contact-tap analytics (2026-09-24)

**Decision.** A `navigator.sendBeacon` ping per tap (never delays the tap; the endpoint always
answers 204 and reveals nothing). Stored as one row per provider × button × visitor × Dar calendar
day (unique index + ON CONFLICT DO NOTHING), so numbers mean *people*, not taps. The visitor is a
random httpOnly cookie issued by `proxy.ts` on page load (issuing it from the first beacon let
simultaneous first taps count as different people — found in browser testing); only
sha256(salt | day | provider | cookie) is stored, so it can't be reversed or linked across days or
providers. No IP or account id is stored. Taps are only counted for live providers and buttons
they actually show; taps by the provider's own members and by admins are ignored; same-origin
check + 120/h per-visitor rate limit. The provider dashboard shows 30-day counts; the full
analytics dashboard is Phase 10.

## ADR-035 — Service requests and matching (2026-09-24)

**Decision.** A customer posts one request (category or service, description, area, optional
street details, date, time, budget, contact preference, up to 5 photos). It is matched to up to
15 providers using the same search as customers (`searchProviders`: live, offers the
service/category, serves the area; same order as search), never to the customer's own
businesses. Request Quote on a profile now opens the same form addressed to that one provider
(a *direct* request) — the Phase 6 WhatsApp/SMS hand-off is removed, so the button no longer
needs contact details. A request stays open until the end of its preferred day (Dar time), or 14
days, capped at 60; expiry is evaluated on read (no background job). At most 5 open requests per
customer.

## ADR-036 — Privacy until acceptance (2026-09-24)

**Decision.** Matched providers see the job, area, timing, budget and photos, and the customer as
"First L.". The street details, phone and email are returned by the data layer only to the
provider the customer accepts (and the customer then sees that provider's phone/WhatsApp).
Photos live in the private bucket and are served through `/api/request-photos/[id]`, which checks
customer / matched provider / admin and redirects to a 5-minute signed URL; anyone else gets 404.

## ADR-037 — Responses, quotes and messages (2026-09-24)

**Decision.** Per match a provider can say they're interested, decline, send a quote (one per
provider per request, revisable while SENT, withdrawable) and message. A conversation is the
`RequestMatch` itself (customer ↔ one provider); the sender's side is derived from who is signed
in, never from the client. The customer accepts one provider who responded: a conditional update
(`status = OPEN AND expiresAt > now`) claims the request so only one acceptance can win, the
chosen quote becomes ACCEPTED (partial unique index: one per request), the other quotes DECLINED
and the other matches NOT_SELECTED. The customer can cancel, or mark the job done. The first
response time is stored per match for Phase 8's "Fast response" (not shown yet). Prices are only
what providers enter — the platform never estimates.

## ADR-038 — In-app notifications (2026-09-24)

**Decision.** A `Notification` row stores a type + request/match ids only; the text is written in
the reader's language at display time, so nothing private is copied. Written in the same
transaction as the event. A bell with the unread count sits in the header for customers and
providers; opening a request marks its notifications and the other side's messages read.
Push/SMS/email notifications are not part of this phase.

## ADR-039 — Verified-job reviews (2026-09-24)

**Decision.** When a customer saves a review, the server sets `verifiedJob` if that customer has
a COMPLETED request accepted by this provider (re-checked on every edit); it is shown as
"Verified job". Reviews without a job are still allowed (SEC-024); Phase 8 decides how ranking
weighs them.

## ADR-040 — Smart ranking: weighted organic signals, paid placement kept outside (2026-09-25)

**Context.** Phases 3–4 ordered results lexicographically (relevance → area → distance band →
open now). The brief asks for twelve signals with admin-configurable weights, and for featured
providers to get promotional placement without corrupting trust.
**Decision.** `lib/ranking/engine.ts` (pure, unit-tested) scores each signal 0…1 from real data —
service relevance, location relevance, service area, distance (from the provider's *public*
point), availability, verification rank, Bayesian rating (prior 3.5, weight 5), review quality
(verified-job share + volume), response rate and median response time (last 90 days, from
Phase 7 request matches), profile completeness (the same `computeCompletion` the dashboard uses),
recent activity — and combines them as a weighted mean. Missing data is neutral, not zero, where
it's about being new (rating, response rate/time), so new providers aren't buried. Defaults keep
the Phase 3–4 guarantees (tests: relevance beats distance, serving the area beats being closer
elsewhere, trust can't beat a much better match). Service relevance can't be weighted to 0.
**Paid placement.** No paid or promotional input exists in the engine, the weights schema is
strict (unknown keys such as `featured` are rejected) and `RankingConfig` holds organic weights
only. Phase 11 will add Featured/Sponsored results as separately labelled slots placed *around* the
organic list; they never change a provider's score, badges or position within the organic list.
**Consequences.** Search and request matching (which uses search) share one ranking. Stats cost
two grouped queries per search over at most 500 candidates; Phase 13 can cache or precompute them.

## ADR-041 — Ranking configuration (2026-09-25)

**Decision.** One `RankingConfig` row holds the weights (whole numbers 0–10). Admins and super
admins edit them at `/admin/ranking`, with a preview that runs a real search with the draft
weights and shows each provider's per-signal scores (nothing saved). Every save/reset is written to
the append-only audit log with before/after values. Weights are cached for 30 s per server
instance; saving clears the cache. Stored values are re-sanitised on read, so a bad row falls back
to defaults per signal instead of breaking search.

## ADR-042 — Fast response badge goes live (2026-09-25)

**Decision.** "Fast response" is shown when the provider's median first reply over the last 90
days is ≤ 60 minutes with at least 3 answered requests. A decline counts toward response *rate*
(the customer isn't left waiting) but not toward response *time*.

## ADR-043 — AI search: the model parses, the database answers (2026-09-25)

**Context.** Customers should be able to type "I need AC repair in Mikocheni today". The brief
forbids the AI from inventing providers, prices, reviews, qualifications, availability or business
information.
**Decision.** `/ask` sends the sentence to Claude (`claude-opus-5`, low effort, structured
outputs) with our catalogue in the system prompt. The output schema is built from the live
catalogue, so the model can only return our service/category/area slugs, a timing code (NOW /
TODAY / TOMORROW / THIS_WEEK / ANY), an urgency code and, when unsure, a clarification reason with
candidate service slugs. Results are the ordinary ranked search (Phase 8) for those filters. The
model never sees provider data and **writes no text that customers see** — every sentence on the
page, including the clarifying question, is our own translated copy. The server re-validates the
output against the catalogue (`sanitizeIntent`), so even a manipulated answer can only narrow the
search to real services and areas. When it can't tell the service, no results are shown; we ask.
**Fallbacks.** Without `ANTHROPIC_API_KEY`, on any API error/timeout (8 s), on a refusal, or over
the rate limit, a deterministic rule-based parser (catalogue names + keywords, typo-tolerant,
Swahili/English timing and urgency words) answers instead, so the feature always works. Server-side
refusal fallback (`fallbacks: "default"`) is enabled on the API call.
**Privacy & cost.** The sentence is not stored; answers are cached in memory for 10 minutes by
normalised text. Rate limits per visitor (30/h) and IP (120/h) apply to model calls only.
The catalogue prompt is rendered deterministically and cached (prompt caching).

## ADR-044 — Provider analytics: people per day, recorded after the response (2026-09-25)

**Decision.** Profile views and search appearances are stored in `ProviderMetric`, with the same
rules as contact taps (ADR-034): one row per provider × kind × person × Dar calendar day, keyed by
a salted daily hash of the anonymous visitor cookie (not reversible, not linkable across days or
providers). No IP, account id or search text is stored; appearances keep only the service and area
the customer filtered by. The provider's own members and admins are never counted; bots/link
previewers (user agent), router prefetches and browser speculative prefetches are ignored.
Recording runs in Next's `after()`, so it never slows or breaks a page. Appearances are the
providers actually rendered: the page of search results (or map), the top 10 on Ask GO BIG, category
pages and the home-page sections. A person is counted once per provider per day, and the source
kept is where they first saw/opened that provider that day.
**Visitor id on the first page.** `proxy.ts` now also adds a newly issued visitor id to the
forwarded request's cookies, so a brand-new visitor's first page can be counted.
**Page.** `/provider/insights` ("How customers are finding you"): 7/30/90-day periods with the
previous span for comparison; funnel (appeared → opened → contacted) with conversion rates; three
small-multiple daily charts (one scale each — never two axes) with a table view; sources; top
services/areas searched; contact buttons; requests (received, response rate, typical reply time,
chosen, completed); reviews; saves. Short tips appear only when numbers support them.
**Navigation.** Provider tab bar: Dashboard · Requests · Insights · Reviews · Account (five fit a
phone); Verification moved to a link on the dashboard.

## ADR-045 — Saved providers (2026-09-25)

**Context.** The analytics brief counts favourites, which didn't exist.
**Decision.** Customers can save live providers from the profile page (guests are sent to log in);
their list is at `/saved` (a Saved tab). Providers only ever see counts, never who saved them.
Saved lists hide providers that are no longer live.

## ADR-046 — Monetization without selling trust (2026-09-25)

**Decision.** Four plans: Free, Pro, Professional, Featured (`prisma/seeds/plans.ts`,
`npm run db:seed:plans`). Paid plans start **without a price** — GO BIG doesn't invent prices; a
super admin sets them, and an unpriced plan can't be requested. What plans can change:
gallery size (Free keeps today's 12; paid plans 30 by default), whether featured campaigns may be
bought, the order of the verification review queue (Professional/Featured first — same rules, same
decision), an optional monthly request quota (only when an admin switches paid leads on; off by
default, so nothing changes for anyone until then). What plans can **never** change: badges,
verification levels, ratings, reviews, organic ranking signals or position. Plans aren't shown on
public profiles.
**Paid visibility.** Featured campaigns (bought separately) and the Featured plan's own placement
are shown only in a separately labelled **Sponsored / Tangazo** block — above the first page of
search results (list view) or at the top of a category page — with the note "Paid placement. It
doesn't change ratings, badges or the ranked results below." A campaign only shows when the
provider is already in that search's organic results and its targeting (service / category / area
— only the provider's own services and categories) matches; the organic list is unchanged
(integration-tested: identical order with and without a campaign). Slots (0–5, default 2) rotate
daily between eligible campaigns.
**Payments.** No payment gateway yet: providers request a plan or campaign, pay by mobile money /
bank (instructions set by a super admin), and an admin records the payment reference. The amount
must equal the agreed price; a reference can't be recorded twice; a pending plan starts on payment,
an active one is extended by a period; expiry is evaluated on read. Every step is audit-logged.
A gateway (e.g. mobile-money API) can later call the same `record…Payment` functions.
**Roles.** Prices, plan features and platform switches: super admin. Recording payments, running
campaigns, cancelling subscriptions, voiding payments: admins. Providers: only their own requests.

## ADR-047 — Admin platform: manage everything without code (2026-09-25)

**Decision.** `/admin` is a hub: a "Needs attention" list (verification applications, reports,
reported reviews, payments to confirm, campaign requests), key numbers, and links to every area:
users, providers, categories & services, locations, verification, reviews, requests, reports,
monetization, analytics, announcements, audit log, search ranking and platform settings.
Phone tab bar: Overview · Users · Verification · Reports · Account.
- **People.** Search/filter users and providers. Suspending an account takes effect on the next
  request (sessions are re-checked against the database); suspending a listing hides it and the
  provider can't republish. Every change needs a written reason and is audit-logged. Nobody can
  change their own account; only a super admin can change another admin.
- **Catalogue & locations.** Create/edit/switch off categories (two levels), services (with search
  keywords) and areas (with optional coordinates inside Dar es Salaam). Nothing is deleted and
  slugs never change, so providers' choices and old links keep working.
- **Requests.** Metadata only; an admin can close a request (the customer and providers are told).
- **Reports (SEC-028).** Customers and providers can report a provider listing, a request (matched
  providers) or a conversation (its two parties), once each. Admins resolve or dismiss with a
  written outcome. Conversation messages are visible to an admin **only** inside a report about
  that conversation, and each such view is audit-logged.
- **Announcements.** Super admins send bilingual in-app announcements to customers, providers or
  both (never admins, never suspended accounts).
- **Audit log** viewer with filters. **Platform analytics** (users, listings, requests, engagement,
  reviews, revenue recorded, daily trends, most-requested categories).
- **Platform settings** (super admin): support contacts shown on account pages; open requests per
  customer, providers per request, days a request stays open (defaults = the old constants);
  AI search on/off. Cached 30 s; every save audited.
**Roles.** ADMIN runs day-to-day moderation; SUPER_ADMIN additionally owns policy (prices,
settings, announcements, other admins).

## ADR-048 — Two-factor sign-in for admins (2026-09-26)

**Context.** An admin password alone could be phished; a super admin controls prices, payment instructions and announcements (SEC-042, SEC-040, SEC-043).
**Decision.** TOTP (RFC 6238, 6 digits, 30 s, ±1 step) for ADMIN and SUPER_ADMIN, built on `node:crypto` (no new auth dependency). The secret is stored AES-256-GCM encrypted with `TOTP_ENCRYPTION_KEY`; the last used step is stored so a code can't be replayed; 8 single-use recovery codes are stored as hashes. The session records `mfa`; until it's true, `can()` itself denies every admin permission except setting up two-factor and the account page — enforced there, not only in `proxy.ts`, because server actions can be posted from any URL. Enrolling ends the session so the next sign-in carries `mfa`. Only another super admin can reset a lost device (audited).
**Consequences.** The first super admin must set up an authenticator app at first sign-in. Losing `TOTP_ENCRYPTION_KEY` disables every enrolment (admins then need a reset).

## ADR-049 — Nonce-based Content Security Policy (2026-09-26)

**Context.** Only baseline headers existed (SEC-007).
**Decision.** `proxy.ts` makes a fresh nonce per request and sets the CSP on both the request (Next applies the nonce to its own scripts) and the response. Scripts: `'self'`, the nonce and `'strict-dynamic'`; styles allow inline (React `style` props, Leaflet); images: this site, `data:`/`blob:`, the storage host and the map tile host. `upgrade-insecure-requests` only when the request came in over HTTPS. The proxy therefore runs on every page (API routes and static files excluded), which also makes every page dynamically rendered — already true for this app.
**Consequences.** A new third-party script, image host or connection needs adding to `lib/csp.ts`.

## ADR-050 — Limits that don't cost a database round trip (2026-09-26)

**Context.** The Postgres limiter (ADR-031) adds one round trip — acceptable on logins and uploads, not on every search or profile view. Many Tanzanian mobile users share a carrier-NAT address, and Next hides its prefetch headers from the proxy, so a result list's link prefetches count too.
**Decision.** In-memory fixed windows (`lib/memoryLimit.ts`, bounded map) for discovery pages (1,200 requests per 5 minutes per IP) and the location actions (60/min). The Postgres limiter stays for everything security-relevant (logins, resets, uploads, AI per visitor/IP, the global daily AI cap).
**Consequences.** Counts are per server instance (SEC-044): at launch add the host's firewall rate rules; the in-app cap is the second layer.

## ADR-051 — Performance: cache reference data, keep connections warm (2026-09-26)

**Context.** From this machine one database round trip is ~140 ms; pages took 2–3 s mostly in sequential queries and in re-opening connections (the pool dropped idle connections after 1 s).
**Decision.** `lib/cache.ts` (`memo`/`invalidate`, 5-minute TTL, shared in-flight loads, failures not cached) for areas, catalogue, popular services, top categories, verification levels and the AI catalogue; admin saves call `invalidate("ref:")`. Independent queries run in parallel. The pool keeps idle connections 10 s (`maxLifetimeSeconds` 60). Upload bodies are read with a byte cap (SEC-015); admin-only translations aren't sent to visitors (SEC-041).
**Consequences.** An admin edit to the catalogue shows immediately on the instance that made it and within 5 minutes on others. Production must run next to the database (Frankfurt) — the biggest single speed-up (SEC-045).

## ADR-052 — Premium UI: one token system, two themes, real data only (2026-09-26)

**Context.** Phase 14 polishes the whole experience to the owner's visual direction (premium, minimal, local, fast, trustworthy) and reference mockups. The mockups use invented businesses, prices, review counts, "years in business / jobs done" chips and an earnings chart.
**Decision.**
- *Tokens, not variants.* Colours live as CSS variables in `app/globals.css`; the dark theme only redefines them (`data-theme` from a readable `gobig_theme` cookie, else the device setting), so components need no `dark:` classes. A deep navy ("night") carries hero and feature surfaces; brand green stays the colour of trust and action; WhatsApp buttons wear WhatsApp green so customers recognise them.
- *Layout from the mockups, content from the database.* Cards show the provider's cover or logo (else their initial on the brand gradient — never a stock photo), the real rating ("No reviews yet" otherwise), their own price wording, availability from their hours, distance only as precise as their public point. Things GO BIG does not record (years in business, jobs completed, earnings) are not shown. The provider dashboard's "today" tiles come from the same people-per-day records as Analytics (`dashboardToday`).
- *Navigation.* Customers: Home · Explore · Requests · Saved · Profile. Providers: Dashboard · Requests · Profile · Analytics · More on phones and tablets; a dark sidebar with every section on desktop (admins too). Header links only from desktop width, so tablets never overflow.
- *Search chips.* "Verified" filters to providers with a GO BIG verification level; "Top rated" orders by the review-count-aware rating signal alone. Both are customer choices; paid placement is still never an input (ADR-040).
- *States.* Every area has `loading.tsx` skeletons shaped like the page, an `error.tsx` with retry, and a branded 404. Micro-interactions are limited to a press-in on tap, a lift on hover and a short rise-in for lists, all disabled under `prefers-reduced-motion`.
**Consequences.** New colours must be added as tokens (both themes). The hero uses a drawn skyline silhouette; if the business wants photography, a licensed image can replace it without layout changes.

## ADR-053 — Photos first, covers kept whole, labelled sample businesses (2026-09-26)

**Context.** The owner wanted the test deployment full, and businesses with photos shown first. Cover
photos were cut to 16:9, which removed the heads of people in portrait photos.

**Decision.**
- In the default order, businesses with a cover photo come before those without; the ranking score
  still orders each group. "Top rated" (the customer's explicit sort) is unchanged. A photo is the
  provider's own data, so nothing paid enters ranking (ADR-040 holds).
- Covers are stored whole (max 1600 px, no crop). Pages crop on display with `object-[center_20%]`,
  keeping faces in frame on cards, profiles, compare and the setup preview.
- Sample businesses (`Provider.isDemo`) carry a "Sample" label, their Call/WhatsApp buttons explain
  instead of dialling, and `npm run db:demo:remove` deletes all of them. Only an owner-supplied photo
  becomes a sample's cover, so placeholders never jump the photo-first order. Remove before launch.

## ADR-054 — Scale foundation without new required infrastructure (2026-09-26)

**Context.** Target: 5M+ users; hosting today is one small Render instance; the app will ship through
the Play Store (TWA) with Render as a short-term backend.

**Decision.** Everything scales out but nothing new is *required* to run:
- **Jobs:** a Postgres queue (`Job`, claimed with `FOR UPDATE SKIP LOCKED`, retries with backoff, DEAD
  after max attempts, stale locks reclaimed). Drained by `npm run worker` (any number) or by
  `POST /api/cron/tick` with `CRON_SECRET`.
- **Redis (optional, `REDIS_URL`):** rate-limit counters shared by all instances; commands fail fast
  and fall back to the Postgres limiter.
- **Database:** pool size per instance from `DB_POOL_MAX`; `prismaRead` uses `DATABASE_URL_READ` for
  public discovery only.
- **Sensitive fields:** AES-256-GCM with key ids and rotation (`lib/crypto/fieldCipher.ts`).
- **Operations:** `/api/health` for the host, `x-request-id` on every page response, JSON logs with
  redaction (`lib/log.ts`).

**Consequences.** Moving hosts means setting env vars, not changing code. At very large volume the
queue interface can be backed by a dedicated broker without touching callers.

## ADR-055 — Rides & deliveries on one trip engine (2026-09-26)

**Context.** Owner's request: "Request a Ride" and "Request Delivery" as core features, with ratings;
payment settled off-app (cash / mobile money / bank); a Bolt integration may come later.

**Decision.**
- One `Trip` model for both kinds: REQUESTED → ACCEPTED → ARRIVED → IN_PROGRESS → COMPLETED, or
  EXPIRED (10 min without a driver) / CANCELLED. Every step is a guarded `updateMany` on the expected
  state, so steps can't be skipped or replayed and two drivers can never both win a trip.
- **Dispatch** (`dispatch()` in `lib/services/trips.ts`) offers a trip to the 5 nearest eligible
  drivers — online, seen in the last 2 min, verified, ACTIVE, not a sample business, not busy, right
  vehicle and kind — widening 3 → 6 → 10 km every 45 s through the job queue. An external dispatcher
  (e.g. Bolt) would replace this function's body, not its callers.
- **Fares** come only from the driver's own `baseFare + perKmFare × km` (copied onto the trip at
  acceptance); the final amount and method are recorded by the driver. No in-app payment.
- **Codes:** a 4-digit PIN starts a ride; a 4-digit code from the recipient completes a delivery.
  Stored encrypted, compared in constant time, 10 tries per trip per hour.
- **Privacy:** exact pickup/drop-off, notes and recipient name/phone are encrypted
  (`lib/crypto/fieldCipher.ts`, purpose-bound) and erased 30 days after the trip ends; the coarse
  pickup (~1 km) and area labels are kept for dispatch and history. Drivers see exact points and
  contacts only after accepting and only while the trip is active. The driver's live position is
  stored only while online and cleared on going offline (or after 30 min without a ping). The
  driver's "Directions" opens the phone's map app via a `geo:` link, not a website.
- **Ratings:** the customer rates a completed trip once (1–5 + comment, within 7 days); the driver's
  average is recomputed from trips inside the same transaction.
- **Live updates** are short polling (5 s) of `/api/trips/[id]` and `/api/driver/offers`, rate
  limited. Server-sent events over Redis pub/sub can replace polling at larger scale without
  changing the screens' data shape.

**Consequences.** Needs `DATA_ENCRYPTION_KEY` on the host (features show "not switched on" without
it). Sample businesses never drive, so testing needs a real verified provider account.

**Update (same day, owner's direction).** Rides and deliveries are reached from each business,
not from the top of Home: every card and profile has "Take me there" (`/ride?to=<slug>`, the
business's public point as destination) and "Deliver to me" (`/delivery?from=<slug>`, the business
as pickup). A live trip has in-app chat between the customer and the driver (`TripMessage`, open
only while active, deleted at purge) and a WhatsApp button as the alternative.

## ADR-056 — Settings centre with feature switches and automation rules (2026-09-28)

**Context.** Owner: the settings page should be more advanced, with automation.

**Decision.** Admin → Settings becomes a settings centre: live system status (database, Redis,
encryption key, job backlog and failed jobs, drivers online, last automation run), feature switches
(rides, deliveries, AI search), request and trip limits (previously constants), and automation rules
run every 5 minutes by the job queue (`lib/jobs/automation.ts`):
- hide a review after N open reports from different people (0 = off; restorable by admins);
- remind a matched business once about a request unanswered after N hours (0 = off);
- take a driver offline after N minutes without a position.
Every automatic action is audit-logged with the system as the actor and listed under "Automation
activity"; nothing is deleted. Only a super admin can change settings; every save is audited with
before/after values. Limits are bounded in validation (e.g. trip data kept 7–90 days).

## ADR-057 — Load testing and what it changed (2026-09-28)

**Context.** Phase 19 of the 5M-user plan: measure, then harden.

**Decision.**
- Load tests never touch live data: `scripts/load/with-test-db.ts` runs the production build on the
  test database and storage. `load:http` (pages) and `load:dispatch` (concurrent trips) are kept.
- Invariants that must hold under concurrency live in the database (partial unique index: one
  active trip per driver), not in read-then-write application code.
- Public reads are shared briefly (`PUBLIC_CACHE_SEC`, default 20 s): identical searches, a
  business's row and stats, and guests' review lists. Owners/admins and personal data are never
  cached; publish/suspend clears search results. In-process for now; the same keys can move to
  Redis when several servers run.
- Client addresses for rate limits come from `TRUSTED_PROXY_HOPS` (measured: 3 on Render).
- The health check's status means "server alive"; database state is informational.

**Next at scale.** Shared Redis cache and CDN caching for guest pages; batch analytics writes; run
the load tests from the hosting region for real latency numbers.

## ADR-058 — Automation Engine foundation (Phase B, 2026-09-28)

**Context.** Owner's Automation Engine brief (Phases A–J). Phase A audit approved.

**Decision.**
- **Transactional outbox:** `emitEvent(tx, …)` writes an `Event` in the same transaction as the
  change (ids only). `dispatchEvents()` claims new events with `FOR UPDATE SKIP LOCKED` and, in the
  same transaction, queues one `automation:rule` job per enabled rule (`createMany … skipDuplicates`
  on the job dedupe key).
- **Registry in code** (`lib/automation/rules.ts`): trigger (event types or an EAT schedule
  slot: 5m / hourly / daily 08:00 / Monday 08:00), zod settings schema, form fields, defaults,
  action. Admins switch rules and tune settings (`AutomationRule`), validated and audited; they
  can't author rule logic.
- **Exactly-once per subject:** `AutomationRun` is unique on (rule, subject) — `event:<id>` or
  `slot:<key>` — on top of job dedupe. Statuses RUNNING → DONE / SKIPPED (switched off) / FAILED
  (queue retries with backoff) / DEAD (last attempt; admin can retry, audited).
- The three Phase 17 rules moved into the registry unchanged (same schedule, logic and defaults);
  the old PlatformSettings columns are retired, not dropped.
- Retention: DONE/SKIPPED runs 30 days, DEAD 90 days, dispatched events 14 days.

## ADR-059 — Notification delivery, preferences and customer follow-ups (Phase C, 2026-09-28)

**Decision.**
- In-app notifications are unchanged and remain the record. `notify()` now also queues one
  `notify:deliver` job per notification **in the same transaction**. The job decides per channel
  (push, email) once — recorded in `NotificationDelivery` (unique per notification + channel):
  skipped with a reason (preference, noSubscription, dailyCap, alreadyRead, notConfigured…),
  held until quiet hours end (Dar time), or sent. Live-trip updates are urgent: no quiet hours or cap.
- Defaults: push on for every category except marketing; email opt-in; quiet 21:00–07:00; daily
  caps 30 push / 10 email. People change these under Notifications → Settings.
- Web Push (free, VAPID) via `/sw.js` and a web app manifest (also the basis of the Play Store
  package). Push text is built from ids in the reader's language — no message text, phone numbers
  or places on a lock screen. Endpoints are limited to the real push services (SEC-056).
- Customer follow-ups as engine rules (hourly, each once per request via the run log): no answer
  after 24 h, quote waiting 24 h, "was the job done?" 3 days after choosing, review invitation 2 h
  after completion (only if not yet reviewed).
- Requests are matched with the full ranking as before; sample businesses are now excluded.
- Request changes emit events (`request.created/responded/accepted/cancelled/completed`) in their
  transactions, for later phases.

## ADR-060 — Bookings, away mode and business engagement (Phase D, 2026-09-28)

**Decision.**
- **Booking** (one per request) opens once the customer has chosen a business. Either side
  proposes a Dar-time date and time (≥ 30 min ahead, ≤ 90 days); the *other* side confirms;
  either side can propose a new time (confirm again) or cancel. The booking completes or cancels
  with its request, in the request's transaction. Customers can only propose inside the business's
  opening hours; the business may pick any time. Every change notifies the other side and emits an
  event in one transaction.
- **Away mode** (`awayUntil`, up to 60 days, ends by itself): no new requests (matching skips the
  business), no trip offers, no booking times inside the away period; customers with bookings in that
  period are told (`BOOKING_AT_RISK`); the public profile shows "Away until …".
- Rules (engine, all admin-tunable): booking reminders to both sides (a day before and shortly
  before, once each), review-reply reminders (once per review, one message a day per business),
  finish-your-profile nudges (Mondays), missed-customers alerts for businesses that didn't sign in
  while requests arrived (Mondays).

## ADR-061 — AI search explanations and help writing requests (Phase E, 2026-10-01)

**Context.** Ask NEXA (Phase 9) already turned a Swahili/English sentence into catalogue slugs,
timing and urgency, asked when the service was unclear, and searched the real database.

**Decision.**
- **Why this match** (`lib/discovery/reasons.ts`, pure): up to three reasons per result built only
  from facts on the card — the requested service, based in / serves the area, within 3 km of the
  customer's own shared position, open now, and earned badges (verified, top rated, quick replies),
  prices listed. No model writes these; nothing can be claimed that the card doesn't show.
- **Ask "where?"** when a service is understood but there is no area and no shared position:
  popular areas plus "use my location".
- **Help me write** (`lib/services/requestAssist.ts`): Claude re-words the customer's own text
  (same language) and reports missing details as fixed codes; the questions are ours. Output passes
  `guardRewrite()`, which discards any rewrite that adds numbers (prices, quantities, dates, phone
  numbers) or links the customer didn't write. The customer sees a suggestion and chooses "Use this";
  nothing is posted automatically. Free rule-based fallback when the model is off, capped or failing.
  Limits: 20 per customer per day, the platform daily AI cap, the admin AI switch.
- Model: `claude-opus-5-5` at `effort: "low"` for both AI calls (was `claude-opus-5`; cheaper and
  current), structured outputs, server-side refusal fallback (`fallbacks: "default"`).

## ADR-062 — The name is GO BIG again (2026-10-01)

**Decision (owner).** The product name returns from NEXA to **GO BIG** everywhere people see it:
screens (English and Swahili), "Uliza GO BIG", the wordmark ("GO" + "BIG" in the brand orange), a new
mark (navy tile, white "G" with an orange crossbar) in the app icon, favicon and manifest, push
notifications, and the two-factor issuer ("GO BIG", encoded in otpauth links). Technical identifiers
nobody sees keep their names — the `@demo.nexa.local` sample-account domain (existing samples and
`db:demo:remove` depend on it) and internal cache/global keys. Earlier ADRs keep their wording as history.
