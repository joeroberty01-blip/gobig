import type { Locale } from "./dictionaries";

// The Go Big help desk on WhatsApp (design wave 2): shown only when an admin has set the desk number
// in Platform settings. The pre-filled message is ours; the customer edits it before sending.

const en = {
  whatsapp: "Chat with Go Big on WhatsApp",
  call: "Call Go Big",
  message: "Hello Go Big, I need help finding someone for:",
  messageWithQuery: "Hello Go Big, I need help finding: {q}",
  emptyHome: "Tell us what you need — we'll find someone for you.",
};

const sw: typeof en = {
  whatsapp: "Ongea na Go Big WhatsApp",
  call: "Piga simu Go Big",
  message: "Habari Go Big, naomba msaada kupata mtu wa:",
  messageWithQuery: "Habari Go Big, naomba msaada kupata: {q}",
  emptyHome: "Tuambie unachohitaji — tutakutafutia mtu.",
};

export type DeskText = typeof en;
export function deskText(locale: Locale): DeskText {
  return locale === "sw" ? sw : en;
}
