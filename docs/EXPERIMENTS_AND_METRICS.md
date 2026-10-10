# Experiments and metrics

2026-10-10. Measure outcomes, not features shipped.

## North-star metric

**Jobs completed through Go Big per week** (request or contact → hire → completed, confirmed by the
customer). It only grows if both sides find each other, reply, show up and finish.

## Funnel and liquidity metrics (per service × neighbourhood "cell")

| Stage | Metric | First target (cells we launch in) |
|---|---|---|
| Supply | Live businesses that replied to a request in the last 14 days | ≥ 8 per cell |
| Demand | Requests + direct contacts per week | grow week on week |
| Speed | % requests with a first reply < 30 min (urgent < 15 min) | ≥ 70% |
| Choice | % requests with ≥ 2 quotes in 24 h | ≥ 50% |
| Hire | % requests ending in a chosen business | ≥ 40% |
| Completion | % bookings confirmed done | ≥ 80% |
| Trust | Reviews per completed job; problem reports per 100 jobs | ≥ 0.5; ≤ 3 |
| Retention | Customers with a 2nd request in 60 days; businesses active 4 weeks later | measure, then set |
| Money (later) | Pro conversion among businesses with ≥ 5 leads; churn | measure, then set |

Data sources already in the app: requests, matches (`firstResponseAt`), quotes, bookings,
completions, reviews, contact taps, profile views, weekly rollups. Missing: a demand-gap log and
no-show tracking (see AUTOMATION_AUDIT).

## Experiments (each: hypothesis, test, success bar, cost)

| # | Hypothesis | Test | Success bar | Cost |
|---|---|---|---|---|
| E1 | **Concierge proves demand**: customers in 2 neighbourhoods will post requests if replies come fast | 2 weeks; flyers/WhatsApp groups/estate managers in e.g. Mikocheni & Sinza [A]; Go Big desk on WhatsApp turns messages into requests; fundis recruited in person | ≥ 50 requests; ≥ 70% replied < 30 min; ≥ 40% hired | Agent time, SMS, flyers |
| E2 | SMS lead alerts beat push/in-app | Randomise businesses: SMS vs in-app only | Median first reply ≥ 2× faster with SMS | SMS |
| E3 | Fundis will join if someone sets them up | Field agents onboard with consent (photos, services, prices, hours) | ≥ 60% of approached fundis live within 7 days | Agent time |
| E4 | Businesses pay after proof | Offer Pro at 3 price points to those with ≥ 5 leads | ≥ 20% convert at the chosen price | none |
| E5 | Certification raises trust | Show "VETA-certified" (when verified) vs not | Higher contact rate on certified profiles | none |
| E6 | Go Big AI helps | Compare conversion of AI-chat sessions vs plain search | Higher request/contact rate per session | API cost (capped) |
| E7 | Price guide helps customers decide | Show "Usual price from real Go Big quotes" when ≥ 10 quotes exist | Higher quote acceptance | none |

## Interview guides (primary research before big bets)

**Customers (20, two neighbourhoods):** last time you needed a fundi/service — who, how found, how
long, what went wrong, what you paid, how you paid; would you send one request and wait for quotes;
what would make you trust a fundi you don't know; WhatsApp or app?

**Businesses (30, 6 trades):** where do jobs come from; jobs per week; what you spend to get work;
how you get messages (SMS/WhatsApp/calls/apps); would you reply to a request within 30 minutes;
what would you pay for a month of real leads, or per job won; do you have VETA certification?

Write findings back into MARKET_RESEARCH_TANZANIA.md with dates and mark assumptions confirmed or not.
