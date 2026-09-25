/**
 * Normalises a phone number to international digits without "+", e.g. "255712345678".
 *
 * Accepts the forms Tanzanians actually type: 0712 345 678, 712345678, +255 712 345 678,
 * 255712345678. A number written with a leading "+" is accepted as already international so
 * a customer abroad can still register. Returns null for anything else.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus = trimmed.startsWith("+");
  // Only digits and common separators are allowed; letters mean it isn't a phone number.
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");

  // Tanzanian mobile numbers start 6 or 7 after the country code.
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;

  if (hadPlus && !digits.startsWith("255") && digits.length >= 8 && digits.length <= 15) {
    return digits;
  }
  return null;
}

/** "255712345678" → "+255 712 345 678" for display. */
export function formatPhone(normalized: string): string {
  if (/^255\d{9}$/.test(normalized)) {
    return `+255 ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`;
  }
  return `+${normalized}`;
}
