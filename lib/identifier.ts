import { normalizePhone } from "@/lib/phone";

export type Identifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads a login identifier that may be an email address or a phone number. */
export function parseIdentifier(raw: string | null | undefined): Identifier | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return EMAIL_RE.test(email) ? { kind: "email", value: email } : null;
  }
  const phone = normalizePhone(value);
  return phone ? { kind: "phone", value: phone } : null;
}

export function identifierWhere(id: Identifier): { email: string } | { phone: string } {
  return id.kind === "email" ? { email: id.value } : { phone: id.value };
}
