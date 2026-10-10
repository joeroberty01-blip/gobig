# Integration Costs and Alternatives

Date: 2026-10-10. Figures are from `EXTERNAL_INTEGRATIONS_RESEARCH.md` with the same confidence key
(✅ official page · 🟡 third party · ❔ ask vendor). USD→TZS shown at an assumed ≈ 2,600 for
orientation only. Monthly estimates assume an **early pilot: ~2,000 requests/month, ~300 businesses**.

## Ranking

Scores 1–5 (5 = best: high value, easy, cheap, strong evidence).

| Rank | Integration | Value | Ease | Cost | Evidence | Verdict |
|---|---|---|---|---|---|---|
| 1 | **SMS via existing SMSGate / local aggregator** | 5 | 5 (built) | 4 | 🟡 | **Essential now** |
| 2 | **Web Push (VAPID)** | 4 | 5 (built) | 5 (free) | ✅ | **Essential now** |
| 3 | **WhatsApp click-to-chat desk (`wa.me`)** | 5 | 5 | 5 (free) | ✅ | **Essential now** |
| 4 | **Paid hosting instance** (Render) | 5 | 5 | 3 | ✅ owner | **Essential now** (owner) |
| 5 | **Phone SMS-code sign-in** (uses #1) | 5 | 4 | 4 | — | **Essential now** (stage C) |
| 6 | **Transactional e-mail via SMTP** | 2 | 5 (built) | 5 | ❔ | Essential, low priority |
| 7 | **Object storage on R2** (S3 adapter exists) | 3 | 5 | 5 | ✅ | Useful now |
| 8 | **Navigation deep links + `.ics` calendar** | 3 | 5 | 5 (free) | ✅ | Useful soon |
| 9 | **Mobile-money aggregator** (ClickPesa / Selcom) for plan payments | 4 | 3 | 3 | ✅/❔ fees | Useful later |
| 10 | **WhatsApp Cloud API** (templates + webhook) | 4 | 3 | 3 | ✅ model / 🟡 rate | Useful later |
| 11 | Smile ID (ID + selfie) | 3 | 3 | ❔ | 🟡 | Later, at scale |
| 12 | Google Places autocomplete | 2 | 4 | 3 | ✅ | Later / maybe never |
| 13 | Self-hosted Photon geocoder | 2 | 2 | 3 (server) | ✅ | Later, only if #12 rejected |
| — | GA4, CRM suites, Google Calendar API, Google reviews import | 1 | — | — | — | **Unnecessary** |

## Cost table

| Item | Setup | Recurring | Pilot month (est.) | Cheaper / local alternative |
|---|---|---|---|---|
| SMS (local) | sender-ID registration via aggregator (❔ fee) | 🟡 TZS 25–50 / SMS | ~4,000 SMS ≈ **TZS 100k–200k** | caps (8/person/day built), SMS only for new request / quote / booking; push first |
| SMS (international: Twilio) | none | ✅ ≈ US$0.43 / SMS | ≈ TZS 4.5M | — (don't) |
| Web Push | none | free | 0 | — |
| WhatsApp `wa.me` | none | free | 0 | — |
| WhatsApp Cloud API | Meta business verification | ✅ per template message by category; 🟡 ≈ US$0.004 utility (Rest of Africa); service replies in 24 h window free (allowance rules from 1 Oct 2026 — verify) | 2,000 utility msgs ≈ US$8 + BSP fee if any | `wa.me` + WhatsApp Business app on a desk phone |
| E-mail SMTP | domain DNS (SPF/DKIM) | free tiers exist ❔ | ~0 | Gmail/Workspace SMTP |
| Storage R2 | none | ✅ 10 GB free, $0.015/GB-mo, free egress | 0 | Backblaze B2 |
| Hosting (Render paid) | none | ❔ check Render plan page | owner decision | keep free + cron keep-alive (not recommended: still sleeps, wastes hours) |
| Google Maps | billing account | ✅ 10k free calls/SKU/month (Essentials) then PAYG | 0 if under free tier | curated areas + landmarks (current) |
| Mobile money aggregator | KYC, contract | ❔ % per transaction (negotiated) | only on plan payments | manual payment recording (current) |
| Smile ID | contract | ❔ per check | — | human review (current) |
| AI (Claude) | key | per token, capped by `AI_DAILY_CALL_CAP` | owner-set cap | rule-based parser (built) |
| PDPC registration | ✅ fee by staff count (❔ amount) | renew every 5 years | one-off | — (legal duty) |

## Free / open-source alternatives summary

- Maps: Leaflet + OSM tiles (have) — move to a tile provider or self-host when traffic grows (OSM's public tiles are not for heavy use).
- Geocoding: curated areas + landmarks (have); Photon self-host later.
- Analytics: first-party rollups (have); Umami/Plausible self-host optional.
- Messaging: `wa.me` links (have); in-app messages (have).
- Identity: human verification workflow (have) + SMS phone proof (stage C).

## What improves what

| Feature | Customer experience | Provider operations | Revenue / retention |
|---|---|---|---|
| SMS + reply links | faster replies | reply without app | more matches → more paid plans |
| Push | instant updates | instant leads | return visits |
| WhatsApp desk | human help when stuck | assisted onboarding | rescues lost requests |
| Phone sign-in | 1-field sign-up | fundis without e-mail can join | bigger supply |
| Mobile-money plans | — | pay plan from phone | **direct revenue** |
| Calendar/.ics | reminders | fewer no-shows | repeat bookings |
| ID check (later) | trust | faster verification | premium "verified" value |
