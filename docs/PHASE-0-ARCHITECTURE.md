# GO BIG — Phase 0: Discovery & Architecture

Status: **Draft, awaiting approval.** No application code exists yet.
Date: 2026-09-24

GO BIG is a mobile-first service discovery and connection platform, launching in
Dar es Salaam. Its job is the north-star journey:

> Need a service → open app → location detected → search → relevant providers nearby →
> compare profile / price / rating / verification → connect (call, WhatsApp, website,
> directions, book, quote).

---

## 0. Discovery findings

There was no existing GO BIG codebase. The nearest projects on this machine were inspected
for reusable architecture rather than to be modified:

| Project | What it is | What GO BIG takes from it |
|---|---|---|
| `Projects/LOLNBYMFUMO` (woodland-erp) | Spare-parts ERP. Next.js 16 App Router, TypeScript strict, Tailwind v4, Prisma 7 + `@prisma/adapter-pg`, PostgreSQL, NextAuth v5 (JWT, Credentials), Zod, React Hook Form, Nodemailer, date-fns | The whole stack, plus proven patterns: `proxy.ts` role gating that re-reads role/status from the DB on each request; server actions that each check their own role; a read-side Data Access Layer returning DTOs; audit log; `lib/i18n` Swahili/English dictionaries; `lib/smsGateway.ts` (SMSGate, no per-message platform fee); `lib/messaging.ts` phone → WhatsApp number normalisation; `components/ui/*` primitives |
| `Downloads/afya-nyumbani-backend` | Home-care platform, Express + Sequelize + Expo | Nothing structural. Confirms the Tanzanian context (TZS, +255 numbers, Swahili-first users) |

Nothing in either project is being replaced; GO BIG is a new repository.

---

## 1. Technical architecture

**Choice: one Next.js 16 app, installable as a PWA, backed by PostgreSQL (Neon).**

```
 Phone / tablet / desktop browser  (installable PWA, Swahili + English)
        │
        ▼
 Next.js 16 App Router  (Vercel or Netlify)
   ├─ proxy.ts ............ session + role gate per route group
   ├─ Server Components ... read through lib/data/* (DTOs only)
   ├─ Server Actions ...... mutations through lib/actions/* (Zod + role check each)
   ├─ Route Handlers ...... /api/* only where a URL is needed (auth, uploads, CTA tracking, webhooks)
   └─ lib/services/* ...... ranking, geo, notifications, AI (added in their phases)
        │
        ├─ PostgreSQL (Neon) via Prisma 7  +  PostGIS (Phase 4)
        ├─ Object storage for images/documents (Phase 2, S3-compatible)
        ├─ Email (Nodemailer SMTP)  /  SMS (SMSGate, as in the ERP)
        └─ Claude API (Phase 9 only)
```

| Concern | Decision | Why |
|---|---|---|
| Framework | Next.js 16 App Router, TypeScript strict | Same as the ERP; one codebase serves customers, providers and admins |
| Mobile | PWA (`app/manifest.ts`, service worker, web push later) | Customers arrive from a shared link and use it without an install; no app-store gate. A native wrapper can come later without a rewrite |
| DB | PostgreSQL on Neon | Managed, free tier, branching for a test DB, supports PostGIS |
| ORM | Prisma 7 + `@prisma/adapter-pg` | Same as the ERP. PostGIS columns via `Unsupported("geography(Point,4326)")` + raw SQL for geo queries |
| Auth | NextAuth v5, JWT sessions, Credentials provider, bcrypt | Same as the ERP. One login for all roles (not per-role login pages) |
| Validation | Zod at every boundary (forms, actions, route handlers) | |
| Styling | Tailwind v4, own component set | Premium look is Phase 14; structure mobile-first from day one |
| i18n | Swahili + English from Phase 1 (dictionary pattern from the ERP) | Strings are never hard-coded; retrofitting later is expensive |
| Money | Integer TZS (no decimals) | TZS has no minor unit in practice; avoids float errors |
| Hosting | Vercel (or Netlify) + Neon | Free-tier start; decided at first deploy |

Directory layout (created in Phase 1):

```
app/
  (public)/            home, search, category, provider/[slug]  — no login needed
  (auth)/              login, signup, forgot-password, reset-password
  (customer)/account/  favourites, requests, reviews, settings
  (provider)/provider/ dashboard, onboarding, profile, services, analytics …
  (admin)/admin/       dashboard + management screens
  api/                 auth, uploads, tracking, webhooks
components/  ui/ layout/ provider/ search/ admin/
lib/         db.ts auth.ts permissions.ts data/ actions/ validators/ i18n/ services/
prisma/      schema.prisma migrations/ seeds/
docs/        this file, DECISIONS.md
```

---

## 2. Database / entity architecture

Conventions: `cuid` string IDs; `createdAt`/`updatedAt` on every table; soft delete
(`deletedAt`) on user-facing content; enums for closed sets; all money as `Int` TZS;
every foreign key indexed.

### Phase 1 entities (built next)

```
User ──1:1── CustomerProfile (optional, later)
 │
 ├──1:N── ProviderMember ──N:1── Provider ──1:1── ProviderProfile
 │                                  │
 │                                  ├──1:N── ProviderService ──N:1── Service ──N:1── Category (self-ref parent)
 │                                  └──1:N── ProviderServiceArea ──N:1── Location (self-ref parent)
 │
 └── PasswordResetToken, Session data (JWT, no table)
```

| Entity | Key fields | Notes |
|---|---|---|
| **User** | name, email?, phone?, passwordHash, role, status, locale, lastLoginAt | At least one of email/phone required, each unique. `role`: CUSTOMER, PROVIDER, ADMIN, SUPER_ADMIN. `status`: ACTIVE, SUSPENDED, DELETED |
| **Provider** | slug, status, ownerUserId, verificationLevel, publishedAt | The *business*. Holds admin-controlled state. `status`: DRAFT, PENDING_REVIEW, ACTIVE, SUSPENDED |
| **ProviderMember** | providerId, userId, role (OWNER, STAFF) | Lets a business have several logins later without a schema change |
| **ProviderProfile** | displayName, description, phone, whatsapp, email, website, addressText, lat/lng, locationVisibility | The *public content* the provider edits. Split from Provider so provider-editable fields never share a form/table with admin-only fields |
| **Category** | slug, nameEn, nameSw, parentId, icon, sortOrder, isActive | Self-referencing tree = categories + subcategories |
| **Service** | slug, categoryId, nameEn, nameSw, keywords[], isActive | Platform catalogue ("AC repair"). Admin-managed so search is consistent |
| **ProviderService** | providerId, serviceId, priceType, priceMin?, priceMax?, unit?, notes | `priceType`: FIXED, FROM, RANGE, HOURLY, ON_QUOTE. Null price = "Ask for price" — never estimated |
| **Location** | slug, name, type, parentId, lat/lng (centroid) | `type`: COUNTRY, REGION, DISTRICT, WARD, NEIGHBOURHOOD. Seeded from official admin boundaries (Dar's 5 districts, wards), neighbourhoods added by admin |
| **ProviderServiceArea** | providerId, locationId | Areas a mobile provider travels to (radius option added in Phase 4) |
| **PasswordResetToken** | userId, tokenHash, expiresAt, usedAt | Hash stored, never the raw token |

### Later-phase entities (named now so Phase 1 leaves room; NOT built early)

| Phase | Entities |
|---|---|
| 2 | OpeningHours, MediaAsset (logo/cover/gallery), SocialLink, onboarding progress |
| 4 | PostGIS `geog` column on ProviderProfile + Location, service-area radius |
| 5 | VerificationLevel (configurable), VerificationRequest, VerificationDocument, Review, ReviewResponse, ReviewReport |
| 6 | ProviderAction (enabled CTAs + targets), ProviderEvent (append-only analytics) |
| 7 | ServiceRequest, RequestPhoto, RequestMatch, Quote, Conversation, Message, Notification |
| 8 | RankingConfig (weights), ProviderStats (precomputed signals) |
| 10 | Favourite, SearchImpression, daily rollups |
| 11 | Plan, Subscription, Invoice/Payment, FeaturedCampaign, SponsoredCategory |
| 12 | AuditLog, PlatformSetting, Report |

**Trust vs paid separation is structural:** verification and ratings live in their own
tables and feed the organic score; Plans/Campaigns live in separate tables and only ever
fill *separately labelled* placements. No single "score" column mixes the two.

---

## 3. User roles

| Role | How obtained | Purpose |
|---|---|---|
| **Customer** | Self sign-up (default) | Search, contact, favourite, request, review |
| **Provider** | Self sign-up choosing "I offer services" | Owns/edits a Provider; a provider can still browse like a customer |
| **Admin** | Created by a Super Admin only | Runs day-to-day operations (verification, moderation, catalogue) |
| **Super Admin** | Created by a seed script reading credentials from env vars, never a committed password | Everything Admin can do + manage admins, platform settings, ranking weights, plans |

Nobody can pick Admin/Super Admin at sign-up. Role changes are server-side only.

---

## 4. Permission model

Role-based, with ownership checks. Enforced in three layers (as in the ERP):

1. **`proxy.ts`** — route-group gate (`/provider/**` needs PROVIDER, `/admin/**` needs
   ADMIN/SUPER_ADMIN), re-reading role/status from the DB so suspension is immediate.
2. **`lib/permissions.ts`** — one `can(user, action, resource)` helper; every server action
   and route handler calls it. UI hiding is cosmetic only.
3. **Data layer** — queries return DTOs; private fields (exact location when hidden,
   documents, contact data of customers) never leave the server unless allowed.

| Capability | Guest | Customer | Provider | Admin | Super Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Browse / search / view public profiles | ✓ | ✓ | ✓ | ✓ | ✓ |
| Use CTAs (call, WhatsApp…) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Favourite, request service, review | – | ✓ | ✓ | – | – |
| Edit **own** provider profile/services | – | – | own only | ✓ | ✓ |
| Respond to requests / reviews | – | – | own only | – | – |
| Verify providers, moderate reviews, manage catalogue & locations | – | – | – | ✓ | ✓ |
| Suspend users/providers | – | – | – | ✓ (not admins) | ✓ |
| Manage admins, ranking weights, plans, platform settings | – | – | – | – | ✓ |

---

## 5. Navigation structure

Mobile: bottom tab bar. Tablet/desktop: same destinations in a top bar or sidebar.

| Customer (bottom tabs) | Provider (bottom tabs) | Admin (sidebar / drawer) |
|---|---|---|
| Home | Dashboard | Overview |
| Search | Profile | Providers (+ verification queue) |
| Requests *(Phase 7)* | Requests *(Phase 7)* | Customers |
| Saved *(Phase 10)* | Insights *(Phase 10)* | Categories & Services |
| Account | Account | Locations |
| | | Reviews, Requests, Featured, Subscriptions, Settings *(their phases)* |

Tabs for later phases are not shown until their phase ships. Public pages
(home, search, provider profile) need no login — sign-in is asked for only when an
action needs an account.

---

## 6. Main customer flow

```
Open app ─▶ location: ask permission ─┬─ granted → approx position (not stored unless allowed)
                                      └─ denied  → pick area manually (e.g. "Mikocheni")
   ─▶ Home: search bar, categories, nearby/available/featured (labelled)
   ─▶ Search "fundi AC" / pick category ─▶ results (list ↔ map) + filters
   ─▶ Provider card ─▶ profile: services & prices, area, hours, photos, verification, reviews
   ─▶ Connect via provider's chosen CTAs  (no login needed)
   ─▶ optional: save, post a service request, leave a review  (login prompted here)
```

## 7. Main provider flow

```
Sign up (choose "I offer services") ─▶ onboarding wizard, save-as-you-go:
   name → category → services & prices → description → phone/WhatsApp/website
   → location + privacy → service areas → hours → photos → choose CTAs
─▶ profile preview + completion % ─▶ publish (DRAFT → ACTIVE)
─▶ dashboard: edit profile, availability toggle, (later) requests, reviews, verification, insights
```

## 8. Main admin flow

```
Login ─▶ overview (new providers, pending verifications, reports)
   ─▶ review/suspend providers ─▶ verification queue: approve / reject / request changes
   ─▶ maintain categories, services, locations ─▶ moderate reviews & reports
   ─▶ (Super Admin) admins, ranking weights, plans, platform settings; everything audit-logged
```

---

## 9. API / data architecture

- **Reads:** Server Components call `lib/data/*` functions that return typed DTOs. No
  client-side fetching of raw tables.
- **Writes:** Server Actions in `lib/actions/*`: `auth → Zod parse → can() → Prisma
  transaction → audit (from Phase 12, stubbed earlier) → revalidate`.
- **Route handlers (`app/api/*`)** only where a URL is required: NextAuth, signed upload
  URLs, CTA click beacons (`navigator.sendBeacon`), payment/SMS webhooks, and a future
  public JSON API if a native app is added.
- **Search:** Postgres full-text (`tsvector`, Swahili + English keywords on Service) +
  `pg_trgm` for typos in Phase 3; PostGIS distance in Phase 4; weighted ranking SQL in
  Phase 8. No external search engine until data volume proves it's needed.
- **Location privacy:** exact coordinates stored server-side; public DTO returns exact,
  rounded (~500 m), or area-only per `locationVisibility`. Customer location is used per
  request and not persisted unless they save an address.
- **Caching:** public catalogue (categories, services, locations) cached and revalidated on
  admin edits; search results dynamic.
- **Rate limiting:** login, sign-up, password reset, review, request, and tracking
  endpoints (Postgres-backed counter to start; Redis only if needed).
- **AI (Phase 9):** Claude extracts `{service, location, timing, urgency}` as structured
  output → normal search runs → results come only from the database. The model never
  writes provider facts.

---

## 10. Phase roadmap

| # | Phase | Main deliverable | Depends on |
|---|---|---|---|
| 0 | Discovery & Architecture | This document | — |
| 1 | Foundation | Auth (sign-up/login/logout/reset, role choice), core tables, role-gated nav shells, seeds for categories/locations, Super Admin bootstrap | 0 |
| 2 | Provider Profiles | Onboarding wizard, profile editing, media, hours, pricing, public profile page, completion % | 1 |
| 3 | Customer Discovery | Home, search, categories/subcategories, provider cards, filters | 2 |
| 4 | Location Engine | PostGIS, distance, nearby, service-area match, map, directions, privacy controls | 3 |
| 5 | Trust & Verification | Configurable verification levels, document review, reviews + moderation, badges | 2 |
| 6 | Dynamic Connections | Provider-chosen CTAs + click tracking | 2 |
| 7 | Service Requests | "What do you need?" posts, matching, responses/quotes, messaging, notifications | 4, 6 |
| 8 | Smart Ranking | Weighted, admin-configurable ranking; paid placement kept separate | 4, 5, 6 |
| 9 | AI Search | Natural-language search over real data | 8 |
| 10 | Provider Analytics | "How customers find you" | 6, 8 |
| 11 | Monetization | Plans, subscriptions, featured/sponsored, labelled | 8 |
| 12 | Admin Platform | Full admin coverage, audit logs, settings | all |
| 13 | Performance & Security | Audit + fixes | all |
| 14 | UI/UX Polish | Premium design pass | all |
| 15 | Final QA | End-to-end journeys on mobile/tablet/desktop | all |

Each phase ends with: COMPLETED / DATABASE / UI / TESTING / BUGS / NEXT PHASE, then stops
for approval.

---

## 11. Open questions (defaults are used unless you say otherwise)

See `DECISIONS.md` for the full reasoning. Items marked **Q** need your input.

1. **Q — Login identifier.** Default: phone *or* email + password. Password reset by email
   works immediately; reset by SMS needs an SMS channel (SMSGate phone as in the ERP, or a
   paid aggregator). Which do you want for launch?
2. **Q — Default language.** Default: Swahili first, English toggle.
3. **Q — Hosting.** Default: Vercel + a new Neon project named `go-big`.
4. Image storage and map provider are decided at the start of Phases 2 and 4 respectively.
5. Launch catalogue (which categories/services) — I'll propose a starter list in Phase 1
   for you to edit; I won't invent providers, prices or reviews anywhere.
