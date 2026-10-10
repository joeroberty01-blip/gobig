# Technical Integration Roadmap

Date: 2026-10-10. Status: **proposal**. Builds on what exists; no rebuild. Every step ends with tests
(unit + integration on the Neon test branch, E2E journeys), a security review entry in
`SECURITY_BACKLOG.md`, and a deploy.

## 1. Can the current architecture carry this? — Yes, with three additions

| Need | Today | Gap |
|---|---|---|
| Outbound channels | `lib/notifications/delivery.ts`: one row per notification × channel, preferences, quiet hours, caps, URGENT; adapters in `lib/services/notify.ts` (SMTP, web-push, SMS gateway) | adapters are functions, not a swappable interface → **add a provider interface** |
| Background work | DB job queue (`Job`, retries, DEAD + admin retry), automation rules with `claimOnce` | ✓ reuse for webhooks/reconciliation |
| Secrets | env vars on Render only; nothing in client bundles; `NEXT_PUBLIC_*` only for map tiles | ✓ keep; add per-vendor env names |
| Inbound webhooks | none yet (cron endpoint with `CRON_SECRET`) | **add a webhook module**: signature check, idempotency table, raw-body storage limits |
| Payments | none (manual recording, audited) | **add `Payment` + `PaymentEvent` tables** when approved |
| Auth by phone | credentials (email/phone + password), TOTP for admins | **add `OtpCode`** (stage C) |
| Monitoring | `NotificationDelivery` reasons, automation Control Center, audit log | add per-vendor health counters to Control Center |
| Rate limits | `lib/services/rateLimit.ts` (Redis or Postgres) | ✓ reuse |

## 2. Modular integration pattern

```
lib/integrations/
  sms/        index.ts (interface SmsProvider { send(to, text): Promise<Result> })
              smsgate.ts  beem.ts?  (chosen by SMS_PROVIDER env)
  whatsapp/   index.ts (interface) · links.ts (wa.me, now) · cloudApi.ts (later)
  payments/   index.ts (interface PaymentProvider { start(), status(), verifyWebhook() })
              clickpesa.ts | selcom.ts (later)
  geo/        index.ts (areas + haversine now; photon/google later)
  webhooks/   verify.ts (HMAC/timestamp), idempotency.ts
```
Rules: one env var picks the provider; every adapter returns `{ ok, id?, reason? }`; no adapter is
imported by client components (`import "server-only"`); every external call has a timeout (≤10 s),
retries via the job queue, and a recorded reason on failure.

## 3. Security requirements (all integrations)

- Keys only in Render env; never `NEXT_PUBLIC_`; never logged. Rotation documented per vendor.
- Webhooks: HTTPS only, verify signature/shared secret with constant-time compare, reject stale
  timestamps (>5 min), store event id with a unique index (**no duplicate processing**), respond 200
  fast and process in a job.
- Payments: server creates the order with an idempotency key; amount and payer come from our DB, never
  from the client; final state only from webhook **and** status query reconciliation; no stored card data.
- Server-side authorization on every action (existing `requirePageAccess` / permission checks).
- Personal data: phone numbers to SMS/WhatsApp vendors only for the message; PDPA registration before
  scale; data-processing terms with each vendor.

## 4. Sequence

| Step | What | Depends on | Owner action |
|---|---|---|---|
| 0 | **Go live with what's built:** SMS credentials + TCRA sender ID, VAPID keys, SMTP, ANTHROPIC key, paid instance | — | **owner enters secrets in Render** |
| 1 | Wave 1–2 UI (design system, empty states, WhatsApp desk links, timeline) | approval | — |
| 2 | `lib/integrations/sms` interface; keep SMSGate; optional second provider for failover | 0 | get a local quote |
| 3 | Stage B: request rescue + `/admin/desk` + demand-gap log | — | desk WhatsApp number |
| 4 | Stage C: phone OTP sign-in + assisted onboarding | 2 | — |
| 5 | `.ics` calendar + navigation deep links (after acceptance only) | — | — |
| 6 | Stage D: reliability scores, job-problem reports, onboarding SMS drip | 2 | — |
| 7 | Webhook module + payments for **business plans** (one aggregator) | approval, KYC | aggregator account |
| 8 | WhatsApp Cloud API for notifications (templates) with SMS fallback | Meta verification | Meta account |
| 9 | ID verification vendor pilot | volume | contract |

## 5. Fallback behaviour

| If this fails | Then |
|---|---|
| Push | SMS for URGENT/requests, in-app always |
| SMS gateway | recorded `FAILED`/`smsNotConfigured`; desk sees unanswered requests (rescue) |
| WhatsApp API | SMS template; `wa.me` link |
| AI | rule-based parser (built) |
| Payment webhook late | status-query reconciliation job every 5 min for 24 h |
| Geocoder | curated area list |

## 6. Testing approach

Adapters get contract tests with recorded fixtures (no live calls in CI); integration tests use the
Neon test branch; sandbox runs only where a sandbox exists (✅ ClickPesa has **none** — live-money tests
need a tiny-amount plan and owner approval).
