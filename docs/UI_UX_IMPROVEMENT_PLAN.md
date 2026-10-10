# UI/UX Improvement Plan

Status: **proposal — no code changes until approved.** Each item names the screens/components it
touches, the audit finding it fixes (see `APP_DESIGN_AUDIT.md`) and its size (S ≤ ½ day, M ≤ 2 days,
L > 2 days). Request buttons/form and the Ride/Deliver buttons are excluded per your instruction.

## Wave 1 — "Look finished" (design system adoption, 1 week)

| # | Change | Fixes | Touches | Size |
|---|---|---|---|---|
| 1.1 | Primary-colour rule: orange `cta` once per screen, blue for the rest; Button variants `primary/secondary/tonal/ghost` | S4, P1 | `components/ui/index.tsx`, pages using `Button`/`ButtonLink` | M |
| 1.2 | Compact provider card with initials fallback; cover photo only when present (lg only) | S3 | `components/discovery/ProviderCard.tsx` | M |
| 1.3 | Row-style category list on phones, tile grid on lg; icons inline, no tile | S2, cross-cutting 3 | `components/home/CategoryCard.tsx`, `/categories`, `/c/[slug]` | M |
| 1.4 | Header on phones: wordmark without tagline, area pill full width of its text | H2 | `Logo.tsx`, `AppShell.tsx`, `AreaPicker.tsx` | S |
| 1.5 | One location control; hero search uses header area | H3 | `Hero.tsx`, `SearchBox.tsx`, `LocateMe.tsx` | S |
| 1.6 | Hide empty gallery/sections on profiles; shorten privacy copy with "Why?" | P2, H5 | `/p/[slug]`, `LocateMe.tsx` | S |
| 1.7 | Scroll hints (fade edge) on chip rows | H4, S6 | `FilterBar.tsx`, `Hero.tsx` | S |
| 1.8 | Badge explanations popover | trust | `components/trust/*` | S |

## Wave 2 — "Never a dead end" (1 week)

| # | Change | Fixes | Touches | Size |
|---|---|---|---|---|
| 2.1 | Zero-results: primary "Tell us what you need" (existing request link, unchanged) + "Chat on WhatsApp" desk link + "Ask Go Big AI" | S1 | `/search` empty state | S |
| 2.2 | Home "near you" empty state → shows the 3 ways to get help (request, WhatsApp desk, AI) instead of "joining soon" | H1 | home | S |
| 2.3 | Help page: WhatsApp desk + phone hours | N3 | `/help` | S |
| 2.4 | Request **timeline** on request detail | C1 | `/requests/[id]`, `RequestSummary.tsx` | M |
| 2.5 | "Book again" on completed requests & saved businesses | C2 | `/requests/[id]`, `/saved` | M |

## Wave 3 — "Built for the fundi" (1–2 weeks)

| # | Change | Fixes | Touches | Size |
|---|---|---|---|---|
| 3.1 | Provider home = "New requests (N)" with quick replies, today's bookings, this week's views | D1, D3 | `app/provider/page.tsx` | M |
| 3.2 | Provider bottom bar: Requests · Bookings · Profile · More | D1 | provider layout/nav | S |
| 3.3 | Publish-now after 2 setup steps, finish later checklist | D2 | `provider/setup/*`, `Completion.tsx` | M |
| 3.4 | Simple earnings: jobs done + amounts entered by the business | D3 | provider bookings | M |

## Wave 4 — "Operate it" (admin, 1 week)

| # | Change | Fixes | Touches | Size |
|---|---|---|---|---|
| 4.1 | `/admin/desk` work queue | X1 | new page, existing services | L |
| 4.2 | Sidebar grouped by job | X1 | admin layout | S |

## Cross-cutting

- Skeleton loaders for lists; optimistic save/quick reply.
- Data-saver setting (auto with Save-Data header).
- Accessibility pass: contrast of orange buttons, focus rings, labels.
- Every change: unit + integration tests where logic changes, E2E journeys (currently 54 steps), phone
  and desktop screenshots, both languages.

## What we measure after each wave

Wave 1: bounce on home, search→profile rate. Wave 2: zero-result exits, request starts from empty
states, repeat bookings. Wave 3: provider first-reply time, % replying in 2 h. Wave 4: requests rescued.
