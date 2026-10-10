# App Design Audit — Go Big

Date: 2026-10-10 · Scope: every customer, provider and admin surface · Method: walked the live and
local builds at phone (375 px) and desktop widths, read the page and component code. Research only:
no application code was changed for this audit.

Severity: **P1** blocks or loses real requests · **P2** slows people down or looks unfinished ·
**P3** polish.

## 1. What already works (keep it)

- **Mobile-first shell.** Bottom tab bar (Mwanzo · Gundua · Maombi · Uliohifadhi · Wasifu), sticky
  CTA on profiles, 44 px+ tap targets, Swahili default with English switch.
- **One design-token system.** Tailwind v4 `@theme` tokens in `app/globals.css` (brand blue scale,
  action orange, ink/line/surface, success/warning/danger), dark-mode variants, Poppins.
- **Trust is honest.** "MFANO" (sample) badge on demo businesses, verified badge only from the
  verification workflow, prices labelled "set by the provider — confirm before work starts".
- **Privacy by default.** Area only before a business is chosen; approximate "near me" with a plain
  explanation; no exact address on cards.
- **Good empty states exist.** Search with no results offers "Browse categories" and "Describe what
  you need" (request).

## 2. Findings by area

### 2.1 Home and discovery (`app/(customer)/page.tsx`, `components/home/*`)

| # | Sev | Finding | Where |
|---|---|---|---|
| H1 | P1 | **The home promises businesses that are not there yet.** Live DB has 0 real businesses; the "Near you" section shows a large "Businesses are joining" box. Customers who arrive find nothing to tap. | home page, `/search` |
| H2 | P2 | **Header is crowded on phones.** Logo tagline wraps to 2 lines, area pill truncates to "Dar es Salaa", hamburger sits next to it. Three competing elements in 56 px. | `components/layout/Logo.tsx`, `AreaPicker.tsx` |
| H3 | P2 | **Three location controls on one screen**: header area pill, the area select inside the hero search, and "Use my location". People don't know which one counts. | `Hero.tsx`, `AreaPicker.tsx`, `LocateMe.tsx` |
| H4 | P2 | **Quick-filter chips scroll off-screen** ("Wen…" cut) with no visual cue and duplicate the trust row underneath. | `Hero.tsx` QuickFilters/TrustRow |
| H5 | P3 | Long privacy paragraph under "Use my location" in 11 px grey — important but unreadable; one line plus "Why?" would do. | Near-me block |
| H6 | P3 | The Next.js dev badge overlaps the bottom nav in local builds only (not live). | dev only |

### 2.2 Search, categories, filters (`/search`, `/categories`, `/c/[slug]`)

| # | Sev | Finding |
|---|---|---|
| S1 | P1 | **Zero-result search is a dead end in practice**: the two actions are secondary-styled and below the fold on phones. The single best action ("Tell us what you need — businesses will reply") should be the primary button, with WhatsApp desk as a second option. |
| S2 | P2 | **Category cards are oversized** (≈300 px tall on phones, 2 per row) with a **square white icon tile** overlapping the photo — exactly the "unnecessary square icon container" pattern. Users see ~4 categories per screen. |
| S3 | P2 | **Provider cards without a cover photo render a large empty dark-green block** (≈320 px) — looks broken. Needs an initials/colour fallback at a fraction of the height. |
| S4 | P2 | **Two different primary colours fight**: search submit is orange on /search but blue on home; "Omba huduma" orange next to blue "Nipeleke". One primary per screen. |
| S5 | P2 | Results heading "Watoa huduma 0 kwa 'fundi bomba'" wraps into 3 lines beside the List/Map toggle on phones. |
| S6 | P3 | Sort chips ("Wanaofaa zaidi / Wenye alama za juu") are cut off without a scroll hint. |

### 2.3 Registration and sign-in (`app/(auth)/*`)

| # | Sev | Finding |
|---|---|---|
| A1 | P1 | **Sign-up asks for 5 fields** (name, phone, email, password, confirm). Many Dar users have no e-mail they check and forget passwords. Phone + SMS code would remove three fields. |
| A2 | P1 | **A customer must create an account before describing their problem** (`requests/new` → `requirePageAccess`). Highest-intent moment, biggest wall. Draft first, verify phone at submit. |
| A3 | P3 | Desktop sign-in panel is good; on phones the brand panel collapses well. |

### 2.4 Request and booking flow (`components/requests/RequestForm.tsx`)

The form has 7 fields on one page (category, service, description, area, address, date, time) plus
photos and "Help me write". *Per your instruction, the request form and Request buttons are out of
scope for changes; findings are recorded only.*

| # | Sev | Finding |
|---|---|---|
| R1 | P2 | Category **and** service are asked before the description; most people think "my sink leaks", not "Home repairs › Plumbing". (Record only.) |
| R2 | P2 | Private address is asked at request time although only the chosen business sees it later. (Record only.) |

### 2.5 Provider profile (`/p/[slug]`)

| # | Sev | Finding |
|---|---|---|
| P1 | P2 | **Two "Omba huduma" buttons visible at once** (action card + sticky bar) plus Call, WhatsApp, Get price, Ride, Deliver — 7 actions in the first screen. Hierarchy unclear. (Ride/Deliver stay, per your decision; they can be visually secondary.) |
| P2 | P2 | Empty gallery shows a large blank gradient tile. Hide the section when there are no photos. |
| P3 | P2 | No "replies in ~X min" or "jobs done on Go Big" — the two signals Tanzanians ask before calling (planned as reliability scores, stage D). |
| P4 | P3 | Logo fallback is a plain "FB" square; fine, but a coloured initials avatar would look intentional. |

### 2.6 Customer dashboard and tracking (`/requests`, `/requests/[id]`, `/trips`, `/saved`)

| # | Sev | Finding |
|---|---|---|
| C1 | P2 | Request detail shows matches and quotes, but **no timeline** ("Sent to 5 businesses · 2 viewed · 1 quoted"). Customers can't tell if anything is happening. |
| C2 | P2 | **No "book again"** from a completed request or a saved business. |
| C3 | P3 | Saved (Uliohifadhi) has its own tab — high value for return visits; keep. |

### 2.7 Provider dashboard (`/provider/*`)

| # | Sev | Finding |
|---|---|---|
| D1 | P1 | **New requests are not the first thing a business sees.** The dashboard leads with profile completion/insights; the money is in "New requests (N)". |
| D2 | P2 | 6-step setup wizard (`provider/setup/[step]`) is thorough but long for a fundi on a phone; no "publish basic profile now, finish later". |
| D3 | P2 | No schedule/"today" view, no earnings view (bookings exist, totals don't). |
| D4 | — | SMS + one-tap reply link (`/r/[token]`) now lets a business reply without signing in (stage A, live). |

### 2.8 Admin (`/admin/*`, 25 pages)

| # | Sev | Finding |
|---|---|---|
| X1 | P2 | Powerful but **organised by data type**, not by today's work. There's no single "desk" showing what needs a human now (unanswered requests, reports, verifications, risk flags). Planned as `/admin/desk` (stage B). |
| X2 | P3 | Dense tables are desktop-only; acceptable for staff. |

### 2.9 Notifications, messaging, settings, support

| # | Sev | Finding |
|---|---|---|
| N1 | P1 | Push/e-mail/SMS were not configured live, so nobody got told about anything. SMS channel now exists; **needs the SMS gateway credentials in Render** to start. |
| N2 | P2 | Messaging is in-app only; most Tanzanian service talk happens on WhatsApp. The profile has a WhatsApp button (good) but the platform can't track that a conversation happened beyond the tap. |
| N3 | P2 | Help page has no human contact (WhatsApp desk number). |
| N4 | P3 | Settings page is clear; notification matrix now has Push / Email / SMS columns. |

## 3. Cross-cutting issues

1. **Inconsistent primary action colour** (blue vs orange) — decide: *orange = act (request/book)*,
   *blue = navigate/brand*. Applies to `components/ui` Button variants and every page using them.
2. **Card heights** — photo cards at ~300 px make lists slow to scan on 5–6" phones.
3. **Icon tiles** — square white tiles on category cards, home trust row and profile action card.
4. **Empty states for an empty marketplace** — every list must have a useful next step, not "nothing here".
5. **Performance** — free hosting cold start (~76 s) is the single worst UX issue for a first-time
   visitor; no design fixes this (owner action: paid instance).

## 4. Screens and components affected (for the improvement plan)

`components/layout/{AppShell,Logo,MobileDrawer,NavLinks}.tsx`, `components/discovery/{AreaPicker,ProviderCard,FilterBar,LocateMe,SearchBox}.tsx`,
`components/home/{Hero,CategoryCard,PopularServices,AiPromo}.tsx`, `app/(customer)/p/[slug]/page.tsx`,
`app/(customer)/requests/[id]/page.tsx`, `app/provider/page.tsx`, `app/(auth)/signup`, `components/ui/index.tsx` (Button, Card, Badge),
`app/(customer)/help/page.tsx`.
