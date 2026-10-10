# External Integrations Research — Tanzania (Dar es Salaam)

Date: 2026-10-10. **Confidence key:** ✅ confirmed on the vendor's official page in this pass ·
🟡 reported by third parties or partly confirmed — verify with the vendor before signing ·
❔ not found publicly (ask the vendor). No integration is claimed to work until it is built and tested.

## 0. What Go Big already has (no new vendor needed)

| Capability | Today in the code | Notes |
|---|---|---|
| Maps | Leaflet + OSM-style tiles (`NEXT_PUBLIC_MAP_TILE_URL`, attribution env) | Public OSM tiles have a usage policy; a tile provider is needed at scale |
| Push | Web Push with VAPID (`web-push`) | Needs VAPID keys in Render; iOS needs the app on the Home Screen |
| E-mail | SMTP via `nodemailer` (`SMTP_*`) | Works with any SMTP provider |
| SMS | HTTP gateway (`SMS_GATEWAY_URL/USER/PASS`, same SMSGate as the ERP) + new SMS channel | Needs credentials + TCRA sender ID |
| Files | S3-compatible storage (`S3_*`, public media + private bucket) | Any S3 API (R2, B2, AWS) |
| AI | Anthropic SDK, rule-based fallback, daily cap | Needs `ANTHROPIC_API_KEY` |
| Cache/limits | Redis optional (`REDIS_URL`), Postgres fallback | |
| Jobs | DB-backed job queue + cron secret | |

**Conclusion:** the stack already has adapters for the main channels; most "integrations" are
**configuration + vendor accounts**, not new code.

## 1. Location and navigation

### 1.1 Google Maps Platform
1. *Problem:* address search, geocoding, distance. 2. *Benefit:* best POI coverage incl. landmarks.
3. *TZ availability:* ✅ global service. 4. *Tech:* API key restricted by HTTP referrer/IP; Places
Autocomplete (New), Geocoding, Routes. 5. *Cost:* ✅ since 1 Mar 2025 free monthly calls per SKU —
Essentials 10k, Pro 5k, Enterprise 1k; then pay-as-you-go; subscriptions from $100/mo (Starter,
50k calls) ([pricing](https://mapsplatform.google.com/pricing/)). Per-1,000 prices are on the core
services price list (not quoted here). 6. *Accounts:* Google Cloud billing account. 7. *Privacy:*
user-typed addresses go to Google; keep exact addresses server-side. 8. *Risk:* cost spikes from
autocomplete keystrokes — needs session tokens + debounce. 9. *Alternatives:* Photon/Nominatim
(below), static landmark list. 10. **Useful later** (when exact-address flows matter, e.g. booking with
directions).

### 1.2 OpenStreetMap geocoding (Nominatim / Photon)
- ✅ Nominatim public: **max 1 req/s, autocomplete forbidden, must cache, identify User-Agent,
  attribution required** ([policy](https://operations.osmfoundation.org/policies/nominatim/)).
- 🟡 Photon (komoot) public instance: free "be fair", throttled, no SLA; self-hostable (Apache 2.0)
  ([GitHub](https://github.com/komoot/photon)).
- **Recommendation: essential-now alternative is *no geocoder*:** Go Big already uses curated
  areas (wards/neighbourhoods) + approximate device location. Add a **landmark field** ("near Mlimani
  City") as free text. Self-host Photon later if address autocomplete is needed.

### 1.3 Navigation links
- Deep links (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`) are free and need no key.
  Show only to the chosen business after acceptance (privacy rule). **Essential now, ~0 cost.**

### 1.4 Service-area boundaries and distance
- Haversine distance on stored area centroids is enough now (already used for "near me"). PostGIS on
  Neon is available if polygons are needed later. **Unnecessary to buy.**

## 2. Communication

### 2.1 WhatsApp Business Platform (Cloud API)
1. *Problem:* customers and fundis live on WhatsApp. 2. *Benefit:* notifications people actually
read; two-way desk. 3. *TZ:* ✅ Tanzania (+255) is in the **"Rest of Africa"** pricing market
([Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
4. *Tech:* Meta app, verified business, phone number, message **templates** approved per category,
webhook for inbound/status. 5. *Cost:* ✅ per-message pricing for templates (marketing / utility /
authentication) by recipient country; ✅ non-template replies inside the 24-hour customer-service
window are free, utility templates inside the window are free; ✅ click-to-WhatsApp ad entry opens a
72-hour free window. Exact Rest-of-Africa rates are in Meta's CSV/PDF rate card (not read) — 🟡 third
parties quote ≈ US$0.004 per utility message; 🟡 local press reports service replies chargeable
beyond a free monthly allowance from 1 Oct 2026 ([The Citizen](https://www.thecitizen.co.tz/tanzania/business/whatsapp-charges-new-fees-to-affect-tanzanian-businesses-5580516)) — verify on the rate card.
6. *Accounts:* Meta Business verification (company docs). 7. *Privacy:* message content passes Meta;
phone numbers are personal data (PDPA). 8. *Risk:* template rejections, number bans, policy changes.
9. *Alternatives:* `wa.me` click-to-chat links (free, already used), WhatsApp Business app on one
phone for the desk. 10. **Useful later** — start with **free `wa.me` desk links now**, Cloud API when
volume justifies it.

### 2.2 SMS gateways in Tanzania
- ✅ **Sender ID registration with TCRA** is expected by carriers; aggregators often file it for you
  ([Celcom Africa](https://celcomafrica.com/bulk-sms-tanzania), [Twilio TZ](https://www.twilio.com/en-us/sms/pricing/tz)).
- Local aggregators (Beem, NextSMS, Sakura, Celcom Africa, your existing SMSGate): 🟡 local rates
  quoted around **TZS 25–50 per SMS**, cheaper with volume ([Sakura](https://billing.sakurahost.co.tz/knowledgebase/49/Understanding-SMS-Pricing-and-Credit-System-in-Tanzania.html)); ❔ Beem/NextSMS public rate cards not found.
- International: ✅ Twilio ≈ US$0.43/SMS to TZ; 🟡 Plivo ≈ US$0.28–0.30 — **5–10× local cost**.
- **Recommendation: essential now — use the existing SMSGate adapter**; get one competing local quote
  (Beem or NextSMS) for price and delivery reports.

### 2.3 Push notifications
- ✅ Web Push works on Android Chrome; on iOS/iPadOS ≥16.4 **only after "Add to Home Screen"** and
  a user tap to allow ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  Already built; **needs VAPID keys** (free). **Essential now.**

### 2.4 Transactional e-mail
- Already SMTP. Any provider works (Brevo, Resend, Amazon SES, Google Workspace). ❔ Free-tier figures
  not re-verified in this pass. E-mail is a **secondary** channel in TZ. **Essential (cheap) now.**

### 2.5 In-app messaging + delivery status
- Built (messages, `NotificationDelivery` per channel with SENT/SKIPPED/FAILED + reason). **Done.**

## 3. Payments

Today: Go Big **never takes money** — customers pay businesses directly (cash/mobile money); plans are
recorded by an admin (PD decisions D1–D8). Payments research is for **later** (business subscriptions,
then optional deposits).

| Option | What it is | Confirmed | Notes |
|---|---|---|---|
| **Selcom** | Aggregator: Checkout API, wallet **push USSD**, card, Qwiksend bank disbursement, C2B callbacks | ✅ API catalogue & HMAC auth ([docs](https://developers.selcommobile.com/)); keys via support@selcom.net | ❔ sandbox and fees not public ("contact business team") |
| **ClickPesa** | USSD-push collection (M-Pesa, Mixx by Yas, Airtel Money, Halopesa), cards, payouts, BillPay control numbers, TanQR/Lipa Namba | ✅ ([docs](https://docs.clickpesa.com/)) | ✅ **no sandbox — live funds; before KYC: TZS 100,000 total and 100 API calls/day**; ❔ fees |
| **AzamPay** | Checkout API (MNO, bank), callbacks with password | 🟡 third-party plugins list Airtel, Tigo/Mixx, Halopesa, AzamPesa; M-Pesa unclear ([WordPress plugin](https://wordpress.org/plugins/azampay/)) | sandbox exists 🟡; KYC for live; ❔ fees |
| **Vodacom M-Pesa Open API (direct)** | C2B/B2C/reversal | 🟡 opened Oct 2020 ([ITWeb](https://itweb.africa/content/O2rQGMAn3VXqd1ea)); business approval reportedly weeks | lowest fee at scale, one network only |
| **Airtel Money API (direct)** | collection/disbursement | 🟡 | one network |
| **Pesapal / DPO** | regional gateways with cards + mobile money | 🟡 | fallback options |

Must-haves before any payment integration: idempotency keys per payment, signed-webhook verification,
reconciliation job (callback ↔ status query), refunds policy, receipts, TRA/VAT advice (accountant),
BoT rules if holding customer funds (**don't hold funds** — use direct-to-business or subscription only).

**Recommendation:** *useful later* — first paid feature is **business plan payment** via a single
aggregator (ClickPesa or Selcom) using **USSD push + control-number** fallback. Not now.

## 4. Identity and trust

| Option | Notes | Confidence |
|---|---|---|
| Human review (built) | Verification levels, document upload to private bucket, admin decision, audit | ✅ in code |
| **Smile ID** | Document + selfie, "up to 7 Tanzanian ID types" incl. National ID, passport, driver's licence | ✅ marketing page ([Smile ID TZ](https://usesmileid.com/countries/tanzania)); ❔ NIDA lookup & pricing |
| NIDA direct | Government ID authority | ❔ access for private platforms unclear |
| VETA certificates | trade qualifications; VETA programme to certify 80k artisans by 2027 (see MARKET_RESEARCH) | manual check now |
| Fraud monitoring (built) | risk rules (review bursts, new-account reviews, repeated reports), rate limits | ✅ |

**Recommendation:** keep **human review now**; add phone-ownership proof (SMS code, stage C) — cheap
and strong; pilot Smile ID only when volume makes manual review the bottleneck. *Useful later.*

## 5. AI and automation

Already built: Swahili/English natural-language search (rules + Claude), AI request helper, provider
match reasons (verified codes only), floating chat, notification/automation rule engine (21 rules),
daily AI cap. **Next (no new vendor):** request summarisation for businesses in the SMS (rule-based
first), AI-drafted desk replies for admins with human send, weekly ops report. *Essential now: none
new.* Cost control stays: `AI_DAILY_CALL_CAP`, per-IP/visitor limits, rule-based fallback.

## 6. Business tools

| Tool | Recommendation |
|---|---|
| Calendar | `.ics` download/subscribe for bookings — free, no API. *Useful soon.* Google Calendar API — *unnecessary now.* |
| Analytics | First-party analytics already (rollups, no third-party trackers). Add funnel events only. Plausible/Umami self-host *optional*. GA4 *not recommended* (privacy, data cost). |
| CRM | Admin desk + DB is the CRM for now. HubSpot etc. *unnecessary.* |
| Accounting/invoicing | Plan invoices as PDF from our data; export CSV for the accountant. TRA EFD/VFD rules → ask an accountant before issuing tax invoices. *Later.* |
| Reviews/maps data | Don't import Google reviews (terms + trust rule: only Go Big-verified reviews). |

## 7. Other high-value findings

- **Paid hosting** (owner): free plan cold start ~76 s is the biggest conversion killer.
- **PDPC registration** (owner): data-controller registration required; fines TZS 100k–5M; fee depends on
  staff count; certificate valid 5 years ([Afriwise guide](https://insights.afriwise.com/blog/regulatory-and-compliance-update-a-guide-to-initial-compliance-with-tanzanias-data-protection-act), [KPMG](https://kpmg.com/ke/en/home/insights/2025/01/extension-of-deadline-of-registration-of-personal-data-controllers-and-data-processors.html)).
- **Object storage:** Cloudflare R2 ✅ 10 GB free, then $0.015/GB-month, **free egress** ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)) — fits the existing S3 adapter.

## Sources

[Meta WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) ·
[The Citizen on WhatsApp fees](https://www.thecitizen.co.tz/tanzania/business/whatsapp-charges-new-fees-to-affect-tanzanian-businesses-5580516) ·
[Google Maps Platform pricing](https://mapsplatform.google.com/pricing/) ·
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) ·
[Photon](https://github.com/komoot/photon) ·
[Selcom developers](https://developers.selcommobile.com/) ·
[ClickPesa docs](https://docs.clickpesa.com/) ·
[AzamPay WordPress plugin](https://wordpress.org/plugins/azampay/) ·
[Vodacom M-Pesa API (ITWeb)](https://itweb.africa/content/O2rQGMAn3VXqd1ea) ·
[Selcom vs ClickPesa vs Pesapal (McTaba)](https://mctaba.com/learn/tanzania/selcom-vs-clickpesa-vs-pesapal-vs-direct-api-tanzania) ·
[Twilio SMS TZ](https://www.twilio.com/en-us/sms/pricing/tz) · [Plivo SMS TZ](https://www.plivo.com/sms/pricing/tz/) ·
[Sakura SMS pricing](https://billing.sakurahost.co.tz/knowledgebase/49/Understanding-SMS-Pricing-and-Credit-System-in-Tanzania.html) ·
[Celcom Africa TZ](https://celcomafrica.com/bulk-sms-tanzania) ·
[WebKit Web Push on iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) ·
[Smile ID Tanzania](https://usesmileid.com/countries/tanzania) ·
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) ·
[Afriwise PDPA guide](https://insights.afriwise.com/blog/regulatory-and-compliance-update-a-guide-to-initial-compliance-with-tanzanias-data-protection-act) ·
[KPMG PDPC deadline](https://kpmg.com/ke/en/home/insights/2025/01/extension-of-deadline-of-registration-of-personal-data-controllers-and-data-processors.html)
