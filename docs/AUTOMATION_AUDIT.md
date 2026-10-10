# Automation audit

Audit date 2026-10-10. Source: `lib/automation/rules.ts` (21 rules) plus delivery in
`lib/notifications/*`. Channels today: in-app always; push (needs VAPID — **not set live**); email
(needs SMTP — **not set live**); **no SMS or WhatsApp channel for automations**. In practice, on the
live site today, every automation only reaches people who open the app.

## 1. Existing rules — verdict

| Rule | Does | Verdict | Why / change |
|---|---|---|---|
| `request.unanswered-reminder` (off) | Reminds businesses about requests they haven't answered | **Improve → turn on** | The single most important rule for liquidity; must go out by SMS/WhatsApp, not only in-app |
| `request.no-response` | Tells the customer nobody has answered after N hours | **Replace** | Telling the customer "nobody answered" loses them. Replace with *request rescue*: widen to more businesses, then escalate to the Go Big desk, and only then tell the customer what's being done |
| `request.choose-reminder` | Reminds the customer to choose a quote | Keep | Add SMS for phone-only customers |
| `request.completion-check` | Asks the customer if the job was done | Keep | Feeds completion rate (reliability) |
| `review.invite` | Invites a review after a completed job | Keep | Add SMS; reviews are the trust asset |
| `booking.reminder` | Reminds both sides before a booking | Keep | SMS matters most here (no-shows) |
| `review.reply-reminder` | Reminds businesses to reply to reviews | Keep | Low priority |
| `provider.profile-incomplete` | Weekly nudge to finish a profile | **Improve** | Turn into an onboarding drip (day 0/1/3/7) by SMS + an agent task list |
| `provider.inactive` | Tells businesses about missed customers | **Improve** | Make it a reactivation message with proof ("3 customers asked for an AC fundi in Mikocheni this week") |
| `analytics.weekly` | Weekly summary to businesses | **Improve** | Deliver by SMS/WhatsApp — it's the proof of value that later justifies paying |
| `analytics.monthly` | Monthly platform rollup | Keep | |
| `review.auto-hide` (off) | Hides heavily reported reviews | Keep **off** | Flag-only policy; admins decide |
| `trust.review-burst` | Flags review bursts | **Improve** | Ignore sample businesses (11 flags were raised on seeded reviews) |
| `trust.spam` | Flags request/message spam | Keep | |
| `trust.repeated-reports` | Flags businesses reported by several people | Keep | |
| `trust.verification-expiry` | Verification renewal reminders | Keep | |
| `trust.trip-cancellations` | Flags customers cancelling many trips | Keep dormant | Rides paused |
| `driver.auto-offline` | Takes idle drivers offline | Keep dormant | Rides paused |
| `billing.renewal-reminder`, `billing.payment-pending`, `campaign.lifecycle` | Plan/campaign reminders, no auto-charge | Keep dormant | Nothing sold yet |

## 2. New automations — ranked by business impact

Each is event-driven or scheduled through the existing engine (idempotent `AutomationRun`, retries,
DEAD queue, admin control). All respect notification preferences, quiet hours (except a customer's
own urgent request) and daily caps.

| # | Automation | Trigger → conditions → action | Benefit | Failure / retry | Cost (est.) | Risks | Success metric |
|---|---|---|---|---|---|---|---|
| 1 | **Lead alert by SMS / WhatsApp** | `request.created` → each matched business with a phone, within caps → SMS: "Mteja Sinza anahitaji fundi bomba leo — jibu: gobig.tz/r/xxxx" | Businesses actually see leads | Job retries ×3, then DEAD + admin view; fall back SMS→in-app | SMS ~TZS 20 each [R]; ~3–5 per request | Spam → cap per business/day; opt-out word | % requests with ≥1 response < 30 min |
| 2 | **Request rescue** | No response after 20 min (urgent) / 2 h (normal) → widen radius & notify next businesses → after 4 h create a Go Big desk task → tell customer what's happening | Saves requests that would die | Same | Extra SMS | Over-notifying; cap rings at 3 | % requests rescued; time to first response |
| 3 | **Customer updates by SMS** | quote received / booking confirmed / business on the way → SMS to phone-only customers | Customers who don't install apps stay in the loop | Retry ×3 | ~TZS 20 each | Wrong numbers → verify phone on signup | Quote→choose conversion |
| 4 | **Onboarding drip** | Business signed up → day 0/1/3/7 SMS with the next missing step + agent task if stuck | More complete, live profiles | Retry | 4 SMS per business | — | % sign-ups live within 7 days |
| 5 | **Weekly proof-of-value** | Monday → per business: customers who saw / contacted / asked → SMS | Retention; basis for paid plans | Retry | 1 SMS/business/week | — | 4-week business retention |
| 6 | **Demand-gap report** | Daily → searches/requests with 0 or 1 matching business by service × area → admin list + recruitment targets | Tells us exactly whom to recruit | — | none | Logs queries: store service/area codes, not the free text | Gap cells closed per week |
| 7 | **Reliability scoring** | Nightly → response time, quote rate, completion and no-show per business → badges + ranking input | Rewards reliable fundis; customers trust results | — | none | Fairness → explain the score | Complaint rate; repeat hires |
| 8 | **Report-a-problem follow-up** | Customer reports a problem with a job → notify business + open admin case → reminders until resolved | Recourse = trust | Retry | small | Abuse → one report per job | Cases resolved in 72 h |
| 9 | **AI cost guard** | Every Claude call → daily budget; over budget → rule-based answers | Caps paid-API spend | — | saves money | — | Cost per AI-assisted request |
| 10 | **Abandoned request recovery** | Customer started a request but didn't submit (draft) → one reminder next day | Recovers intent | — | 1 SMS | Consent: only signed-in users who allowed SMS | Drafts recovered |

**Consent:** SMS/WhatsApp messages need the person's number and opt-in at signup ("Go Big
inaweza kukutumia SMS kuhusu maombi yako"); marketing stays opt-in only; every SMS carries an opt-out.

**Prerequisites (owner decisions):** pick an SMS provider and register a TCRA sender ID; decide
whether to apply for WhatsApp Business Platform (Meta per-message fees).
