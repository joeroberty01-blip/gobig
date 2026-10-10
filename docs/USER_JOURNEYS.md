# User Journeys — today vs proposed

Date: 2026-10-10. "Today" is what the code does now (checked in the live/local build). "Proposed"
needs approval. Items marked *(out of scope)* fall under your instruction to leave the Request
buttons and request form unchanged — recorded only.

Legend for benefit: **CX** customer experience · **OPS** provider operations · **REV** revenue/retention.

## 1. Customer

### Discover — "Unahitaji huduma gani leo?"
- **Today:** Hero search (text or AI), quick filters, popular services, categories (tall cards),
  floating Go Big AI chat. Search understands Swahili/English via rules + optional Claude.
- **Friction:** empty marketplace (0 real businesses); three location controls; tall cards.
- **Proposed:**
  1. One location control (header pill), hero search uses it. **CX**
  2. Row-style category list on phones (6–7 per screen). **CX**
  3. "Popular this week in Dar" fed by real searches (demand-gap log, stage B) — only once there is real data. **CX/REV**

### Request — describe, place, time, submit
- **Today:** must sign up first (5 fields), then a 7-field form with optional photos and "Help me write".
- **Friction:** account wall before intent; category asked before the problem. *(Form changes out of scope.)*
- **Proposed (outside the form):** phone + SMS code sign-in (stage C) so the wall is 1 field + code. **CX**

### Match — suitable providers
- **Today:** matching by category/service and area; up to N businesses notified; ranking separates
  paid placement from trust (never mixed).
- **Proposed:** request rescue (stage B): no reply in 20 min (urgent) / 2 h → widen radius → human
  desk. Reliability ("replies in ~X min") feeds matching once measured (stage D). **CX/OPS**

### Compare — profiles, quotes, reviews
- **Today:** profile with services/prices, reviews, gallery, verification badge; Compare page for up to N providers; quotes in the request.
- **Proposed:** compact provider cards; badge explanations; quotes shown side by side in the request
  with "includes materials?" and "available when?" fields. **CX**

### Connect — quote, book, call, WhatsApp
- **Today:** Call, WhatsApp (tracked as a contact tap), Request quote, Request service, Ride/Deliver (kept).
- **Proposed:** visual hierarchy only: one orange primary, others secondary; WhatsApp deep link pre-fills
  "Nimekuona kwenye Go Big…" (already partly). **CX/REV** (attribution)

### Track — status, confirmations, completion
- **Today:** request status badge, quotes, booking with confirm/cancel, notifications (in-app; push/email/SMS
  when configured).
- **Proposed:** request **timeline** (sent to N · viewed · quoted · booked · done); SMS at the key moments
  (quote received, booking confirmed) using the new channel. **CX**

### Return — rebook, history, favourites, recurring
- **Today:** Saved tab, request history.
- **Proposed:** "Book again" on completed jobs and saved businesses; "Remind me in 3 months" for recurring
  services (AC service, fumigation) as an opt-in reminder. **REV**

## 2. Provider

| Step | Today | Proposed | Benefit |
|---|---|---|---|
| Join | 6-step wizard, e-mail account | Assisted onboarding by agent + SMS code sign-in; publish basic profile after 2 steps | OPS |
| Get leads | in-app + (now) SMS with one-tap reply link | Dashboard opens on "New requests (N)" with quick replies | OPS/REV |
| Reply/quote | request page or `/r/[token]` | same; quote template per service | OPS |
| Schedule | bookings list | "Today" view + calendar export (.ics) | OPS |
| Get paid | off-app (cash/mobile money) | record "job done + amount" → earnings summary; later payment links | OPS/REV |
| Grow | insights, plan | weekly SMS summary (views, requests, replies) — already a default | REV |

## 3. Admin / operator

| Step | Today | Proposed |
|---|---|---|
| Start of day | open several admin pages | `/admin/desk`: unanswered requests, rescue queue, reports, verifications, risk flags |
| WhatsApp customer | no tool | "Create request for a WhatsApp customer" on the desk |
| Supply gaps | none | demand-gap log: searches with no match, by area |
| Trust | verification, reports, risk pages | same + job-problem reports (stage D) |

## 4. Journey metrics to watch (see `EXPERIMENTS_AND_METRICS.md`)

Search → profile view rate · request submitted per visitor · **first reply time** · requests with ≥1
quote within 2 h · booked / requests · repeat customers in 60 days · businesses replying via SMS link.
