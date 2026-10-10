# Product decisions

Product-level decisions and the evidence behind them. Technical decisions stay in DECISIONS.md (ADRs).
Each entry: evidence → assumptions → recommendation → status.

## PD-001 — Strategy reset after the first market review (2026-10-10) — **awaiting owner approval**

### Evidence (sourced in MARKET_RESEARCH_TANZANIA.md and COMPETITOR_ANALYSIS.md)
- Dar es Salaam: 5.38 M people (2022 census).
- ~20.6 M Tanzanians online (29%, late 2025); smartphone penetration ~40% (TCRA, Sep–Dec 2025);
  76.5 M active mobile-money accounts (Dec 2025) — money moves on phones, not cards.
- Instagram and WhatsApp are the main digital storefronts of Dar SMEs; services are found mostly by
  word of mouth (regional evidence; old Tanzanian studies).
- Visible Tanzanian service marketplaces are small or unclear (e.g. Gig-fully showed 0 open gigs);
  nobody has won Dar.
- Bolt dominates ride-hailing (30,000+ drivers, 8 cities); Uber left on 30 Jan 2026; LATRA rules on
  commissions and fares have changed repeatedly.
- PDPA 2022 requires registration with the PDPC (fines up to TZS 5 M for not registering).
- **Go Big today: 0 real businesses, 0 requests; push/email/SMS lead alerts not working live.**

### Assumptions (must be validated — see EXPERIMENTS_AND_METRICS.md)
- A1 Customers' biggest pain is getting a reliable fundi to reply and show up, more than finding names.
- A2 Fundis read SMS/WhatsApp far more reliably than app notifications or email.
- A3 Fundis will join and reply quickly if someone sets them up and leads are real.
- A4 Businesses will pay a monthly fee after seeing ≥ 5 real leads.
- A5 Starting in 3 services × 3–5 neighbourhoods produces liquidity faster than all of Dar at once.

### Recommendations
1. **Focus**: stop adding features; launch a narrow wedge with field onboarding and a WhatsApp desk.
2. **Fix the loop**: SMS lead alerts + request rescue + phone OTP before any marketing.
3. **Pause rides & deliveries publicly** until LATRA is clarified; don't fight Bolt.
4. **Monetise on proof**: free until liquidity; Pro pilot only for businesses with ≥ 5 leads;
   success-based fees only after payments exist.
5. **Trust as the brand**: reliability signals, report-a-problem, VETA certification, real-quote
   price guide — never invented numbers, never paid ranking.

### Decisions needed from the owner
| # | Decision | Recommended |
|---|---|---|
| D1 | Approve the strategy reset (focus on a wedge + concierge) | Yes |
| D2 | Choose the wedge services and neighbourhoods | Suggest AC repair, plumbing, electrical in Mikocheni, Msasani, Sinza (+ Kinondoni/Masaki) — to confirm with interviews |
| D3 | Approve an SMS provider and TCRA sender ID (paid third party) | Yes — get 2 quotes |
| D4 | Hide Ride/Deliver until LATRA is checked | Yes |
| D5 | Upgrade hosting to a paid plan | Yes |
| D6 | Register the operating company with the PDPC | Yes (legal) |
| D7 | Budget for field agents for the 2-week concierge test | Owner to size |
| D8 | WhatsApp Business Platform application (Meta fees) | Later — start with click-to-chat + SMS |

### Status
Proposed 2026-10-10. Nothing implemented. Implementation starts per item after approval, in small
tested phases, with results written back here.
