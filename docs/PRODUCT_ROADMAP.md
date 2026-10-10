# Product roadmap — first 90 days

Drafted 2026-10-10. **Nothing here is approved yet.** Effort: S ≈ 1–3 days, M ≈ 1–2 weeks, L ≈ 3+
weeks of build. Cost notes are estimates; see MONETIZATION_STRATEGY.md.

## Top 10 improvements (scored)

Score = customer value + provider value + revenue potential + differentiation + evidence (each 1–5)
minus effort and risk (1–5 each).

| # | Improvement | Pri | Who benefits | Effort | Score | Measured by |
|---|---|---|---|---|---|---|
| 1 | **Concierge launch in a narrow wedge** (3 services × 3–5 neighbourhoods, field onboarding of 60–100 businesses) | P0 | both | M (mostly ops) | 19 | Liquidity metrics per cell |
| 2 | **SMS (later WhatsApp) lead alerts + request rescue** | P0 | both | M | 18 | % replied < 30 min |
| 3 | **Phone-first accounts**: SMS one-time code for sign-in and reset; verify phone at signup | P0 | both | M | 15 | Lock-outs; signup completion |
| 4 | **Go Big desk on WhatsApp**: customers message a number, staff (with Go Big AI) create the request | P1 | customers | S–M | 15 | Requests via WhatsApp; time to first reply |
| 5 | **Assisted onboarding** ("create profile for a business" by an agent, with the owner's consent and SMS confirmation) | P1 | providers | M | 14 | % approached fundis live in 7 days |
| 6 | **Reliability signals**: replies-in, show-up rate, completion rate; ranking input | P1 | customers | M | 13 | Problem reports; repeat hires |
| 7 | **Report a problem with a job** + admin case flow + strike policy | P1 | customers | M | 13 | Cases resolved < 72 h |
| 8 | **Weekly proof-of-value SMS** to businesses | P1 | providers, revenue | S | 13 | 4-week retention; Pro conversion |
| 9 | **Demand-gap report** for recruitment | P1 | ops | S | 12 | Gap cells closed |
| 10 | **Pro plan pilot** for businesses with ≥ 5 leads | P2 | revenue | S (built) | 11 | Conversion, churn |

Also P0 (owner actions, not build): paid hosting (no cold start), PDPC registration, secrets, LATRA
decision. P2/P3 later: VETA partnership & badge, price guide from real quotes, business tools
(quote/invoice to WhatsApp), B2B accounts, payments aggregator, insurance partner, new cities.

## 90-day plan

### Days 1–14 — Foundations (no public marketing yet)
- Owner: paid hosting plan; PDPC registration; SMS provider + TCRA sender ID; set secrets; super
  admin; decide on rides (recommend: hide Ride/Deliver); choose the wedge (services × areas).
- Build: SMS channel in the notification engine; SMS lead alerts; phone OTP sign-in/reset; hide
  rides/deliveries behind a setting; trust rules ignore sample businesses; demand-gap log.
- Research: 20 customer + 30 business interviews (guides in EXPERIMENTS_AND_METRICS.md).
- Exit: a business can receive a request by SMS and reply from a cheap phone in under a minute.

### Days 15–45 — Wedge launch (concierge test E1)
- Ops: field agents onboard 60–100 businesses in the wedge; Go Big desk on WhatsApp; flyers/estate
  managers/neighbourhood WhatsApp groups for demand.
- Build: request rescue (widen → desk task); customer SMS updates; onboarding drip; assisted
  onboarding; weekly proof-of-value SMS; remove sample businesses from the wedge's live results.
- Exit: ≥ 50 real requests; ≥ 70% replied < 30 min; ≥ 40% hired. If not, fix supply/speed before
  anything else.

### Days 46–90 — Reliability and first revenue test
- Build: reliability signals and ranking input; report-a-problem flow; price guide (only where ≥ 10
  real quotes); AI cost guard.
- Commercial: Pro pilot (E4) with businesses that got ≥ 5 leads; talk to VETA about certified-artisan
  referrals; 2 property-manager B2B conversations.
- Exit: north star growing week on week; first paying businesses; decision on next 3 cells.

## Dependencies and operating costs (monthly, to confirm with quotes)

| Item | Depends on | Estimate |
|---|---|---|
| Paid hosting (no sleep) | Owner account | Render paid instance + Neon plan — check current prices |
| SMS | Provider contract, TCRA sender ID | ~TZS 20/SMS × volume [R] |
| WhatsApp Business Platform (optional) | Meta business verification | per message (Meta rate card) |
| Claude API | `ANTHROPIC_API_KEY` | ~US$0.01 per AI question [A], capped daily |
| Field agents | Hiring/ops | the largest cost — size it in E1 |
