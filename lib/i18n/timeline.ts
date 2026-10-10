import type { Locale } from "./dictionaries";
import type { TimelineKey } from "@/lib/requests/timeline";

// Request timeline labels (design wave 2). {n} = how many businesses.
const en: { title: string; bookAgain: string; steps: Record<TimelineKey, { done: string; current: string; todo: string }> } = {
  title: "What's happened so far",
  bookAgain: "Book {name} again",
  steps: {
    posted: { done: "Request posted", current: "Request posted", todo: "Request posted" },
    sent: { done: "Sent to {n} businesses", current: "Finding businesses for you…", todo: "Sent to businesses" },
    replied: { done: "{n} replied", current: "Waiting for replies", todo: "Replies" },
    quoted: { done: "{n} sent a price", current: "Waiting for prices", todo: "Prices" },
    chosen: { done: "You chose a business", current: "Choose a business", todo: "You choose a business" },
    booked: { done: "Time agreed", current: "Agree a time", todo: "Time agreed" },
    done: { done: "Job done", current: "Mark the job done", todo: "Job done" },
    cancelled: { done: "Request cancelled", current: "", todo: "" },
    expired: { done: "Request expired", current: "", todo: "" },
  },
};

const sw: typeof en = {
  title: "Kilichotokea hadi sasa",
  bookAgain: "Agiza tena kwa {name}",
  steps: {
    posted: { done: "Ombi limetumwa", current: "Ombi limetumwa", todo: "Ombi limetumwa" },
    sent: { done: "Limetumwa kwa biashara {n}", current: "Tunakutafutia biashara…", todo: "Kutumwa kwa biashara" },
    replied: { done: "{n} wamejibu", current: "Tunasubiri majibu", todo: "Majibu" },
    quoted: { done: "{n} wametuma bei", current: "Tunasubiri bei", todo: "Bei" },
    chosen: { done: "Umechagua biashara", current: "Chagua biashara", todo: "Unachagua biashara" },
    booked: { done: "Muda umekubaliwa", current: "Kubalianeni muda", todo: "Muda kukubaliwa" },
    done: { done: "Kazi imekamilika", current: "Thibitisha kazi imekamilika", todo: "Kazi kukamilika" },
    cancelled: { done: "Ombi limesitishwa", current: "", todo: "" },
    expired: { done: "Muda wa ombi umeisha", current: "", todo: "" },
  },
};

export function timelineText(locale: Locale) {
  return locale === "sw" ? sw : en;
}
