# Market research — Tanzania (Dar es Salaam first)

First pass: 2026-10-10. Desk research only (no interviews yet). Every figure carries its source and
date; **[V]** = verified in a primary or first-hand source we read, **[R]** = reported by a news or
vendor source we could not check against the original, **[A]** = our assumption, needs validation.

## 1. The size of the opportunity

| Fact | Value | Status | Source |
|---|---|---|---|
| Dar es Salaam population (2022 census) | 5.38 million, the largest region | [V] | [NBS via The Citizen, 2022](https://thecitizen.co.tz/tanzania/news/national/tanzania-s-population-hits-61-7-million-mark-4004404); council split in [citypopulation.de (NBS data)](https://www.citypopulation.de/en/tanzania/admin/07) |
| Dar growth | ~1 million more people 2012→2022 (4.36 M → 5.38 M) | [R] | same |
| Mobile subscriptions (Dec 2025) | 106.9 million (SIMs, not people) | [R] TCRA via press | [The Guardian, 27 Jan 2026](https://ippmedia.co.tz/the-guardian/news/local-news/read/telecom-subscriptions-hit-1069-million-as-use-of-internet-surges-2026-01-27-104628) |
| Internet **subscriptions** (Dec 2025) | 58.6 million | [R] TCRA via press | same |
| Internet **users** (people, late 2025) | **20.6 million, 29.1% of population** | [V] Kepios | [DataReportal Digital 2026: Tanzania](https://datareportal.com/reports/digital-2026-tanzania) |
| Smartphone penetration | 39.53% (Sep 2025); 41.8% (Dec 2025, secondary citation) | [R] TCRA via press | [The Citizen](https://www.thecitizen.co.tz/tanzania/news/national/tanzania-s-5g-rollout-reaches-26pc-as-internet-use-jumps-5120490), [TCRA PDF](https://www.tcra.go.tz/tcra-tovuti/2025/mamlaka-website/news/attachments/en_1765781866_Digital_Opportunities_on_Surge_9281f9e769.pdf), [Daily News](https://dailynews.co.tz/tanzanias-digital-divide-wont-close-until-smartphones-are-in-every-hand-3) |
| Active mobile money accounts (Dec 2025) | 76.5 million; 664.7 million transactions in the quarter | [R] TCRA via press | [AllAfrica / Daily News, Feb 2026](https://allafrica.com/stories/202602100375.html) |
| Mobile money share (Dec 2025) | M-Pesa 41.2%, Mixx by Yas 29.5%, Airtel 18.5%, HaloPesa 10% | [R] | same |
| Facebook ad reach (late 2025) | 7.95 million | [V] Meta ad tools | DataReportal 2026 |
| Instagram ad reach (late 2025) | 4.10 million | [V] Meta ad tools | DataReportal 2026 |
| WhatsApp / TikTok users | **Not found** in public sources | gap | — |
| Median fixed download speed (end 2025) | 19.54 Mbps | [V] Ookla | DataReportal 2026 |

**What this means.** The headline TCRA "85% internet penetration" counts SIM subscriptions; the
number of *people* online is about 20.6 million (29%). Most of them live in cities, and Dar is the
densest market, but **a large share of Dar customers and most fundis are still on basic phones or
low-end Android with limited data** [A]. Anything we build must work on a cheap phone, in Swahili,
and must not depend on the person installing an app or receiving email.

## 2. How people find and hire service providers today

Evidence is thin; most of this needs primary research.

- **Word of mouth, referrals and personal networks** dominate in the region [R]: a Kenyan founder
  describes households relying on "last-minute referrals or word-of-mouth" with no way to verify a
  fundi's skills or integrity ([TechTrends Africa on Fixo](https://techtrends.africa/fixo-turning-fundi-to-a-digital-marketplace/)).
  A Tanzanian first-hand account (Arusha) describes "no guarantee for the work" and a system "largely
  based on word of mouth, reputation" ([Hanselman, 2006 — old, anecdotal](https://www.hanselman.com/blog/arusha-tanzania-2006-day-22-finding-a-fundi)).
- **Instagram and WhatsApp are the main digital storefronts** of Dar SMEs [R]: a UDSM study of Dar
  SMEs found them "the most preferred and used social media in Tanzania" ([UDSM repository](https://libraryrepository.udsm.ac.tz/items/8669bdda-3c57-4ba4-9e5a-2901702fd875) — old, 2016);
  a 2024 Dodoma study links WhatsApp use to SME sales ([CBE](https://dspace.cbe.ac.tz/items/7d36bb8d-9bcc-47fc-af17-54b3075f20ce));
  The Citizen describes Kariakoo sellers whose customers "follow his WhatsApp status updates"
  ([The Citizen, 2025](https://www.thecitizen.co.tz/tanzania/business/how-social-media-platforms-turn-winga-into-serious-business-players-5224162)).
- **Classifieds**: Jiji.co.tz carries services and "CV" listings from tradespeople ([Jiji](https://jiji.co.tz/sw/manual-labour-cvs)).
- **Ride-hailing**: Bolt operates in 8 Tanzanian cities with 30,000+ drivers; **Uber exited on 30
  January 2026** ([The Chanzo, Feb 2026](https://thechanzo.com/2026/02/01/uber-exits-tanzania-amidst-regulatory-squeeze-and-fierce-competition/)).

**Gap:** we found no Tanzanian study on how customers choose or verify fundis, what goes wrong, what
they pay, or how often they need each service. This is the first thing to validate (see
EXPERIMENTS_AND_METRICS.md).

## 3. Customer pain points (to validate)

| Pain | Evidence | Status |
|---|---|---|
| Can't tell a good fundi from a bad one; no recourse when work is poor | Kenyan founder interview; Arusha anecdote | [R]/[A] |
| Calling several fundis one by one, many don't answer or don't show up | Common complaint in the region | [A] |
| Price uncertainty: no reference price, haggling | — | [A] |
| Safety: letting a stranger into the home | — | [A] |
| Urgency: burst pipe, no power, AC on a hot day | — | [A] |

## 4. Provider pain points (to validate)

| Pain | Evidence | Status |
|---|---|---|
| Irregular work; depend on referrals | Regional platforms' framing (Fixo, Kandua) | [R] |
| Marketing costs and skills: no time/expertise for social media; fake accounts; negative comments | UDSM SME study (2016) | [R] |
| No way to prove skills to strangers | VETA programme exists to certify "unrecognised" artisans | [R] |
| Leads arrive on WhatsApp/calls, not in apps | — | [A] |
| Mobile money fees when customers pay across networks: up to 19% to pay TZS 5,000 cross-network | [Finetech Africa](https://finetechafrica.substack.com/p/why-c2b-payments-market-is-hard-for) | [R] |

## 5. Regulation and risk

| Area | What we found | Status | Action |
|---|---|---|---|
| **Personal Data Protection Act No. 11 of 2022** (in force 1 May 2023) | Controllers/processors must register with the PDPC; last reported deadline 30 April 2025; fines TZS 100,000–5,000,000 for not registering; small-entity fee reported as TZS 100,000 (renewal TZS 50,000 every 5 years) | [R] law-firm updates | **Register Go Big's operating company with the PDPC before launch** ([FB Attorneys, Jan 2025](https://fbattorneys.co.tz/registration-for-companies-under-data-protection-law-extended/), [Afriwise](https://insights.afriwise.com/blog/regulatory-and-compliance-update-a-guide-to-initial-compliance-with-tanzanias-data-protection-act)) |
| **Ride-hailing (LATRA)** | Private Hire Services Regulations GN 78/2020; commission cap moved 15% (Mar 2022) → up to 25% + 3% booking fee (Dec 2022); fares per km set by LATRA; sources disagree on the current cap | [R] | Our rides/deliveries feature needs a **LATRA licence check before any public use** ([Clyde & Co, 2023](https://www.clydeco.com/en/insights/2023/01/regulatory-changes-affecting-ride-hailing-services), [The Citizen](https://thecitizen.co.tz/tanzania/news/national/latra-gives-nod-for-bolt-uber-to-charge-up-to-25-percent-commission-4080344)) |
| **Identity (NIDA)** | Direct NIDA API access appears limited to authorised entities (banks, MNOs, government); vendors (Didit, Shufti) resell checks | [R] vendor pages | Keep manual document review now; evaluate a licensed vendor only if fraud appears |
| **Skills certification (VETA)** | "Mama Samia Skills Recognition and Certification Programme" aims to certify 80,000 artisans by 2027, free to applicants, via VETA/council offices; no public certificate lookup found | [R] | **Partnership opportunity**: show "VETA-certified" as a verification step; refer uncertified fundis to the programme ([Daily News](https://dailynews.co.tz/the-end-of-unqualified-tanzania-targets-80000-skilled-artisans/)) |
| **SMS sender ID** | Pre-registering the sender ID with TCRA is recommended to avoid blocking | [R] | Do it before sending SMS |

## 6. Costs of the channels Tanzanians use

| Channel | Cost found | Status | Source |
|---|---|---|---|
| Bulk SMS (local vendor) | ~TZS 19–20 per SMS at 5,000–50,000 volume | [R] vendor listing, undated | [Celcom Africa](https://celcomafrica.com/bulk-sms-tanzania) and local vendors via search |
| International SMS APIs | US$0.14 (Plivo) – US$0.32 (Twilio) per SMS | [R] | [sent.dm](https://www.sent.dm/en/resources/sms-pricing/tanzania-sms-pricing) |
| WhatsApp Business Platform | Per-message pricing since 1 July 2025; Tanzania rate not confirmed. Third-party estimate: utility ~US$0.02–0.03, marketing ~US$0.04–0.06 | [R] | [Meta](https://developers.facebook.com/docs/whatsapp/pricing), [ChatDaddy (vendor)](https://chatdaddy.tech/blog/whatsapp-business-api-tanzania) |
| Mobile money collection (merchant) | Not published by aggregators; estimates 1–3% per collection | [R] blog | [Kolonell](https://kolonell.com/en/blog/true-cost-of-accepting-mobile-money-hidden-fees-tanzania-2026) |
| Bank/instant payment fee caps | BoT caps TIPS/TACH fees (TZS 2,000 per transaction, 2024) | [R] | [Daily News](https://dailynews.co.tz/tanzania-steps-up-measures-to-lower-the-cost-of-mobile-money-transactions/) |

## 7. Primary research we still need (before big bets)

1. 20 customer interviews in two Dar neighbourhoods: last time you needed a fundi — how did you find
   them, what went wrong, what did you pay, would you post a request and wait for quotes?
2. 30 fundi/business interviews (plumbers, electricians, AC, cleaners, salons, mechanics): where do
   jobs come from, how many a week, how much do they spend to get work, would they pay per job won /
   per month, do they read SMS/WhatsApp/app notifications?
3. A 2-week concierge test (see EXPERIMENTS_AND_METRICS.md) to measure real request→response→hire rates.
