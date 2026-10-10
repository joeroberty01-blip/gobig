import type { Locale } from "./dictionaries";

// One-tap reply page (/r/<token>) for businesses who get a new request by SMS. Server-rendered; the
// client form gets only the strings it needs as props.

const en = {
  title: "New request",
  invalid: "This link has expired or isn't valid. Open Go Big to see your requests.",
  closed: "This request is no longer open.",
  openApp: "Open in Go Big",
  where: "Where",
  when: "When",
  budget: "Budget",
  interested: "I'm interested",
  quickTitle: "Quick reply",
  quick: ["I can come today.", "I can come tomorrow.", "Please send me a photo of the problem.", "Please call me."],
  priceTitle: "Send a price",
  amount: "Price (TZS)",
  note: "Note (optional)",
  sendPrice: "Send price",
  decline: "I'm not available",
  done: "Sent. The customer will see it in Go Big.",
  declined: "OK — we won't send you more about this request.",
  error: "Couldn't send. Please try again.",
  limit: "You've used this month's free leads. Open Go Big to see your plan.",
  privacy: "The customer's phone number and exact address are shown once they choose you.",
};

const sw: typeof en = {
  title: "Ombi jipya",
  invalid: "Kiungo hiki kimeisha muda au si sahihi. Fungua Go Big kuona maombi yako.",
  closed: "Ombi hili halipo wazi tena.",
  openApp: "Fungua kwenye Go Big",
  where: "Wapi",
  when: "Lini",
  budget: "Bajeti",
  interested: "Nipo, nimevutiwa",
  quickTitle: "Jibu la haraka",
  quick: ["Naweza kuja leo.", "Naweza kuja kesho.", "Tafadhali nitumie picha ya tatizo.", "Tafadhali nipigie simu."],
  priceTitle: "Tuma bei",
  amount: "Bei (TZS)",
  note: "Maelezo (si lazima)",
  sendPrice: "Tuma bei",
  decline: "Sipatikani",
  done: "Imetumwa. Mteja ataona kwenye Go Big.",
  declined: "Sawa — hatutakutumia zaidi kuhusu ombi hili.",
  error: "Imeshindikana kutuma. Jaribu tena.",
  limit: "Umetumia maombi ya bure ya mwezi huu. Fungua Go Big kuona mpango wako.",
  privacy: "Namba ya simu na anwani kamili ya mteja zinaonekana akikuchagua.",
};

export const replyLinkText = (locale: Locale) => (locale === "sw" ? sw : en);
export type ReplyLinkText = typeof en;
