# Product gap analysis

Audit date 2026-10-10 (commit b89f085). Data counts were read from the live database (read-only).

## A. What Go Big is today

A bilingual (Swahili/English) web app (installable, Play Store via TWA) for Dar es Salaam where
customers find local service businesses, compare them, contact them (call/WhatsApp/in-app), post
service requests that matched businesses answer with quotes, agree a booking, and review the job.
Around it: verification levels with document review, trust ranking, Go Big AI (natural-language
search + recommendations + floating chat), business analytics, plans/campaigns (manually paid),
rides & deliveries (built, not live), an automation engine with 21 rules, risk flags, and an admin
platform with audit log and an automation control centre.

**State of the live database (2026-10-10):**

| | Count |
|---|---|
| Businesses | 18 — **all samples**; **0 real** |
| Service requests | **0** |
| Trips | 0 |
| Customer accounts | 7 (test/sample) |
| Reviews | 56 (on sample businesses) |
| Paid plans priced | 0 of 3 (prices unset by design) |
| Subscriptions / payments | 0 / 0 |

**What it should become:** the fastest trusted way to get a fundi or service business to *reply and
show up* in Dar es Salaam — for customers, one request instead of ten calls; for businesses, a steady
source of real jobs plus a reputation they own.

## Strengths worth keeping

- Request → quotes → choose → booking → completion → verified-job review: the core loop exists
  end to end (54-step browser test passes).
- Honest-by-design trust: earned badges only, paid placement labelled and kept out of ranking,
  reviews tied to real jobs, AI that cannot invent facts. This is a real differentiator against
  Instagram/Jiji, *if* we can prove it with real businesses.
- Swahili-first, phone-sized UI; works in the browser without installing an app.
- Response-time data and verified-job flags already exist — the base for reliability signals.
- Automation engine with idempotent rules, preferences, quiet hours, caps, audit, admin control.

## Weaknesses and gaps

### P0 — trust, function or viability (fix before any real launch)

| # | Gap | Why it matters | Evidence |
|---|---|---|---|
| P0-1 | **Zero real supply and demand** | A marketplace with no businesses has no value; features don't fix this | DB counts above |
| P0-2 | **Businesses never hear about new requests** unless they open the app: push needs VAPID keys, email needs SMTP (both unset on live), and there is no SMS/WhatsApp lead alert | The core loop dies at step 2; most fundis live on SMS/WhatsApp [A] | `lib/notifications/delivery.ts`; Render env |
| P0-3 | **Password reset depends on email/SMS gateway** (SMS_GATEWAY_* / SMTP) — phone-only users can be locked out | Phone-first market | `lib/services/notify.ts` |
| P0-4 | **Cold start ~76 s** on the free Render plan after idle (measured 2026-10-06) | First impressions; Play Store reviews | measured |
| P0-5 | **Legal**: PDPC registration of the operating company not confirmed; rides/deliveries without a LATRA check | Fines / shutdown risk | MARKET_RESEARCH §5 |
| P0-6 | Secrets still to set: `DATA_ENCRYPTION_KEY`, VAPID, SMTP/SMS, `ANTHROPIC_API_KEY`; super admin; rotate DB password / storage key / ERP PAT | Security backlog SEC-004 etc. | SECURITY_BACKLOG.md |

### P1 — next release

| # | Gap |
|---|---|
| P1-1 | No way to **recover an unanswered request** beyond telling the customer; no widening to more businesses, no human/concierge escalation |
| P1-2 | **Customers can't reach Go Big on WhatsApp** — the channel they already use to find fundis |
| P1-3 | No **assisted onboarding** for fundis who can't set up a profile alone (field agent / "create on behalf" with consent) |
| P1-4 | No **"report a problem with a job"** flow after a booking (only content reports) — no recourse = the trust gap |
| P1-5 | **Demand gaps are invisible**: searches/requests with no matching business aren't reported to admins for recruitment |
| P1-6 | Sample-data side effects: 11 risk flags raised on seeded sample reviews; trust rules should ignore sample businesses |
| P1-7 | Reliability signals are partial: response time exists; show-up/no-show and completion rate don't |

### P2 — growth and monetisation

- Price guidance per service built from real quotes (never invented).
- Provider business tools (quote/invoice/receipt shared to WhatsApp, customer list, job history).
- VETA certification as a verification step; partnership for supply.
- B2B accounts (property managers, offices, schools) with multi-site requests and monthly invoicing.
- Referral programme (customers and fundis).

### P3 — longer term

- In-app mobile-money payments with escrow (needs BoT-licensed aggregator + dispute ops).
- Insurance/warranty partner (Kandua/Santam model).
- Expansion to Arusha, Mwanza, Dodoma once Dar cells are liquid.

## Features to pause or simplify

| Feature | Recommendation | Why |
|---|---|---|
| **Rides & deliveries** | **Pause publicly** (hide the Ride/Deliver buttons) until LATRA is clarified and core services work | Bolt dominates (30,000+ drivers); Uber left Jan 2026 under regulatory/competitive pressure; it distracts from the core loop and adds legal risk |
| Featured campaigns / paid plans | Keep built, **don't sell yet** | Nothing to sell until businesses get leads |
| Go Big AI | Keep, but measure; cap daily spend | Useful only if it raises request/contact rates |
