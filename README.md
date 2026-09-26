# GO BIG

Mobile-first service discovery and connection platform, starting in Dar es Salaam.

**Status:** Phases 1–12 (Foundation, Provider profiles, Customer discovery, Location engine, Trust & verification, Connection system, Service requests, Smart ranking, AI search, Provider analytics, Monetization, Admin platform) complete; awaiting approval for Phase 13.

Security findings are tracked in [SECURITY_BACKLOG.md](SECURITY_BACKLOG.md).

- [Phase 0 architecture](docs/PHASE-0-ARCHITECTURE.md)
- [Architecture decision log](docs/DECISIONS.md)

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Prisma 7 + `@prisma/adapter-pg` ·
PostgreSQL on Neon (`go-big`, Frankfurt) · NextAuth v5 (JWT, credentials) · Zod ·
React Hook Form · Vitest. Swahili (default) and English.

## Setup

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, DIRECT_URL, DATABASE_URL_TEST, AUTH_SECRET
npm run db:deploy             # apply migrations
npm run db:seed:catalog       # categories, services, Dar es Salaam areas (safe to re-run)
npm run db:seed:super-admin   # first super admin from SUPER_ADMIN_* env vars, then clear them
npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `test` | Unit tests + integration tests (integration runs only against `DATABASE_URL_TEST`) |
| `db:migrate` | New migration in development (uses `DIRECT_URL`) |
| `db:deploy` | Apply migrations |
| `db:seed:catalog` | Insert-only starter catalogue and locations |
| `db:seed:super-admin` | Create the first super admin from env vars |

## Layout

```
app/(auth)/        login, signup, forgot-password, reset-password
app/(customer)/    home (/), /search, /categories, /c/[slug], /account — public + customer shell
app/provider/      provider area (PROVIDER only): dashboard, setup/[step] wizard + section editor
app/(customer)/p/[slug]  public provider profile
app/api/provider/media  image upload (multipart → sharp → object storage)
app/admin/         admin area (ADMIN, SUPER_ADMIN)
proxy.ts           route gate; re-reads role/status from the DB
lib/permissions.ts can(actor, action) — the one permission table
lib/services/      framework-free business logic (tested directly)
lib/actions/       server actions: validate → can() → service
lib/data/          read queries returning DTOs
lib/i18n/          sw/en dictionaries
prisma/            schema, migrations, seeds
tests/             unit/ and integration/
```

## Object storage

Provider photos live in Neon Object Storage (bucket `provider-media`, public read). Set
`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; integration tests use
`S3_ENDPOINT_TEST` (the test branch) and refuse to run otherwise. Verification documents go to a
separate **private** bucket (`S3_PRIVATE_BUCKET`, default `verification-docs`) and are only read
through 60-second signed URLs issued to reviewers.

## Password reset delivery

Email via SMTP when set; SMS via SMSGate for phone-only accounts when set. With neither,
development prints the link in the server console and production logs an error. The token
is in the link's `#fragment`, so it never reaches server or proxy logs.

## Admin two-factor sign-in

Admins and super admins must set up an authenticator app (Google Authenticator, Microsoft
Authenticator, Authy…) before any admin page works: after signing in they land on
**Admin → Two-factor sign-in**, scan the QR code, confirm a code, save the 8 recovery codes, and
sign in again. Requires `TOTP_ENCRYPTION_KEY` (32 random bytes, base64 — `openssl rand -base64 32`);
keep it safe, since losing it disables every admin's two-factor. A lost phone: another super admin opens
the user in **Admin → Users** and resets it.

## Deployment

- **Region:** run the app in the same region as the database (Neon `eu-central-1` → Vercel
  `fra1` / Frankfurt). Each page makes several database round trips; from another continent each
  costs ~140 ms.
- **Before launch:** rotate the database password and storage credential (SECURITY_BACKLOG
  SEC-004), set a monthly spend limit in the Anthropic Console and `AI_DAILY_CALL_CAP` (SEC-036),
  add the host's firewall rate-limit rules for `/search`, `/p/*` and `/ask` (SEC-044), and use a
  production map tile provider (SEC-021).
- **CI:** `.github/workflows/ci.yml` runs typecheck, lint, unit tests, `npm audit` and a secret
  scan on every push once the repository has a GitHub remote.

## Design system (Phase 14)

Colours, shadows and motion are tokens in `app/globals.css`; the dark theme redefines the same
variables (user choice in Account → Appearance, else the device setting). Shared building blocks:
`components/ui` (Button, Card, EmptyState, Skeleton…), `components/discovery/ProviderCard`
(`tile` for grids and carousels, `row` for results), `components/states` (loading skeletons, error
and 404 views). Add new colours as tokens for both themes rather than hard-coding them.

