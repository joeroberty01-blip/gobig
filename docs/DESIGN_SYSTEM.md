# Go Big Design System — proposal v2 ("Dar Daylight")

Status: **proposal, awaiting approval.** It evolves the current tokens in `app/globals.css`; nothing
is replaced wholesale. Customer, provider and admin all share it.

## 1. Direction

**"Dar Daylight": calm, bright, trustworthy, fast.** Ocean-blue brand from the Dar skyline hero,
warm orange only for the one action that matters, lots of white, real photos of real work. Premium
comes from restraint: fewer boxes, clearer type, tighter cards — not from effects.

Principles:
1. **One primary action per screen**, always orange. Everything else is blue text or outline.
2. **Content over containers.** Icons sit inline with text; no square tiles behind icons unless the
   icon *is* the button.
3. **Compact by default.** A phone screen should show 4–6 items of a list, not 2.
4. **Say it in Swahili first,** short words, no jargon. English is equal, never mixed in one line.
5. **Light on data.** System fonts fallback, images ≤ 80 KB on lists, no autoplay, motion ≤ 200 ms.

## 2. Colour tokens

Existing tokens stay; the change is **how they're used**.

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand-50` | #eef4ff | #0f1a33 | tinted backgrounds, selected chip |
| `brand-100` | #dbe6ff | #142347 | hover on tinted |
| `action` / `link` (= `brand-600`) | #1f5ff2 | existing dark value | links, secondary buttons, focus ring |
| `brand-900` | #142f80 | #dbe6ff | headings on tinted bg |
| `cta` (orange) | #ff9500 (hover #e3800b) | same | **the one primary CTA** (Omba huduma, Book, Send price) |
| `ink` / `ink-muted` / `ink-subtle` | existing | existing | text 3 levels only |
| `line` | existing | existing | 1 px borders |
| `success` / `warning` / `danger` (+ `-soft`) | existing | existing | status only, never decoration |
| `verified` | = `brand-600` | | verified badge |
| `sample` | `cta` fill, white text | | "MFANO" badge |
| `night-700…900` | #1d3354 → #0b1b33 | | dark hero/promo bands |
| `whatsapp` | #22c55e | | WhatsApp actions only |

Rule: orange appears **once** per viewport. Blue is the brand, not the button.

Gradients: allowed only in (a) the hero photo fade, (b) the wordmark, (c) the AI entry point.
Glass (backdrop-blur) only on floating elements over photos (sticky profile bar, AI chat button).

## 3. Typography

Poppins (already loaded) for headings and UI; system UI fallback. Body copy can stay Poppins at
weight 400 — test Swahili line lengths (Swahili words are long; avoid `text-justify`).

| Style | Size / line | Weight | Use |
|---|---|---|---|
| Display | 32/38 (phone) · 48/56 (lg) | 700 | hero only |
| H1 | 24/30 · 32/40 | 700 | page title |
| H2 | 18/26 · 22/30 | 600 | section |
| H3 | 16/22 | 600 | card title |
| Body | 15/22 | 400 | default (16 on inputs to stop iOS zoom) |
| Small | 13/18 | 400 | meta, helper |
| Micro | 11/14 | 600, uppercase tracking +0.04em | badges only |

Minimum body size on phones: 13 px. Nothing important at 11 px (fixes audit H5).

## 4. Spacing, radius, elevation

- 4 px base scale: 4, 8, 12, 16, 20, 24, 32, 48. Page gutter 16 (phone) / 24 (tablet) / 32 (lg).
- Radius: inputs/buttons **12**, cards **16**, sheets **24**, chips/avatars full.
- Elevation: borders first (`ring-1 ring-line`); shadow only for floating items (sheet, FAB, sticky bar).

## 5. Components

### Buttons (`components/ui` → `Button`)
| Variant | Look | Use |
|---|---|---|
| `primary` | `cta` orange fill, ink or white text (check contrast), 48 px | the one main action |
| `secondary` | white, blue text, 1 px line | other actions |
| `tonal` | brand-50 fill, brand-900 text | chips that act (filters) |
| `ghost` | text only, blue | tertiary, "See all" |
| `danger` | danger text/outline | destructive, always confirm |
Icons: 18 px, inline left, no tile. Loading: spinner replaces icon, label stays (no layout jump).

### Forms
Label above, 16 px input text, 48 px height, helper text below, error in danger with icon and text
(never colour alone). Phone input with fixed `+255` prefix. Money input with `TSh` prefix, thousands
separators while typing.

### Service / category card (replaces current tall card)
- **Row card** on phones: 72 px thumbnail (rounded 12) left, name + 1-line examples right, chevron.
  6–7 categories per screen instead of 4.
- **Tile card** on lg: 4:3 photo, name below; icon inline before the name (no tile).

### Provider card (search results)
- Compact list card ≈ 140 px: avatar/logo 56 px (initials on colour if none) · name · ★ rating (n) ·
  area · "From TSh X" · badges (Verified, Sample) · open-now text. Cover photo **only when present**
  and only on lg.
- One action: "View" (tap whole card); optional heart.

### Status indicators
Pill with dot: `Open` (blue), `Quoted` (warning), `Booked` (success), `Done` (ink), `Expired` (muted),
`Cancelled` (danger). Same pill everywhere (customer, provider, admin) — `StatusBadge` is already
shared; extend, don't fork.

### Timeline (new, for requests)
Vertical list of events with time: Sent to N businesses → Viewed → Quote received → Booked → Done.

### Bottom sheet (new)
For filters, area pick and the reply/quote form on phones (instead of new pages).

### Badges
Verified (blue check), Sample (orange "MFANO"), Top-rated, Fast replier (from reliability scores).
Every badge has a tap-to-explain popover ("What does this mean?").

### Empty states
Illustration-free: one line of text + one primary action + one secondary. Never a dead end.

### Loading
Skeletons matching the real layout (cards, rows); no full-page spinners. Optimistic UI for favourites
and quick replies.

## 6. Navigation structure

**Customer (phone):** bottom bar — Home · Search · Requests · Saved · Account (unchanged). Header:
wordmark (no tagline on phones) + area pill + menu. Floating AI button bottom-right (present).
**Customer (lg):** top nav — Home, Services, Go Big AI, About, Help · language · Log in / Sign up.
**Provider:** bottom bar — Requests (badge count) · Bookings · Profile · More. Requests first.
**Admin:** left sidebar grouped by job: *Today (Desk)* · Marketplace · Trust & safety · Money ·
Platform.

## 7. Motion and micro-interactions

- 150–200 ms ease-out for press, sheet open, toast. Respect `prefers-reduced-motion`.
- Heart pop on save; check-mark morph on "Sent"; skeleton shimmer max 1.2 s cycle.
- No parallax, no autoplay carousels, no confetti.

## 8. Responsive rules

| Breakpoint | Layout |
|---|---|
| < 640 | single column, bottom nav, sheets, row cards |
| 640–1023 | 2-column grids, bottom nav stays |
| ≥ 1024 | top nav, 3–4 column grids, side filters on search, sticky profile action column |
Max content width 1200; reading width 680.

## 9. Accessibility

WCAG 2.2 AA contrast (orange #ff9500 text on white fails; as a fill, white text on it is also below 4.5:1, so primary buttons need dark ink text or a darker orange such as #c96a00 — decide at implementation with a contrast check), focus
ring 2 px brand-600, all icons with labels, tap targets ≥ 44 px, forms announce errors, language
attribute switches with locale.

## 10. Data-saver

Setting (and auto when `navigator.connection.saveData`): no cover photos on lists, thumbnails at
240 px, no map tiles until asked.
