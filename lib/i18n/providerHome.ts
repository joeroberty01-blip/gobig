import type { Locale } from "./dictionaries";

// Provider dashboard, design wave 3: new requests first, the week's bookings, finished jobs.

const en = {
  newRequests: "New requests ({n})",
  newRequestsNone: "No new requests right now. We'll let you know when one comes in.",
  openRequest: "Open",
  more: "See all requests",
  upcoming: "Your next 7 days",
  upcomingNone: "No bookings yet this week.",
  proposed: "Waiting for confirmation",
  confirmed: "Confirmed",
  jobs: "Jobs finished on Go Big (30 days)",
  jobsCount: "{n} jobs",
  agreed: "Agreed prices: {amount}",
  agreedNote: "From the prices customers accepted. Payment happens outside Go Big.",
  noPrice: "{n} without a price on Go Big",
};

const sw: typeof en = {
  newRequests: "Maombi mapya ({n})",
  newRequestsNone: "Hakuna maombi mapya sasa hivi. Tutakujulisha likiingia.",
  openRequest: "Fungua",
  more: "Ona maombi yote",
  upcoming: "Siku 7 zijazo",
  upcomingNone: "Bado hakuna kazi zilizopangwa wiki hii.",
  proposed: "Inasubiri kuthibitishwa",
  confirmed: "Imethibitishwa",
  jobs: "Kazi zilizokamilika kupitia Go Big (siku 30)",
  jobsCount: "Kazi {n}",
  agreed: "Bei zilizokubaliwa: {amount}",
  agreedNote: "Kutoka kwa bei ulizotuma na wateja wakakubali. Malipo hufanyika nje ya Go Big.",
  noPrice: "{n} bila bei kwenye Go Big",
};

export const providerHomeText = (locale: Locale) => (locale === "sw" ? sw : en);
