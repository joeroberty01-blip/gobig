// Passwords too common to allow (Phase 13, SEC-019): the most-used passwords worldwide plus local
// favourites (clubs, places, greetings). Only entries of 8+ characters matter — shorter ones fail
// the length rule first. Small on purpose: it's also checked in the browser.
const COMMON = new Set([
  "00000000", "00000001", "0123456789", "11111111", "11223344", "12121212", "12341234", "12344321",
  "12345678", "123456789", "1234567890", "12345qwerty", "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "22222222",
  "33333333", "44444444", "55555555", "66666666", "69696969", "77777777", "87654321", "88888888",
  "987654321", "99999999", "a1b2c3d4", "aa123456", "abc12345", "abcd1234", "abcdefgh", "admin123",
  "administrator", "alhamdulillah", "allahuakbar", "arusha123", "asante123", "asantesana", "asdfghjk", "asdfghjkl",
  "baseball", "batman123", "bismillah", "blackberry", "changeme", "computer", "contrasena", "dar12345",
  "daressalaam", "darisalama", "default1", "dodoma123", "dragon12", "facebook", "football", "gobig123",
  "gobig2026", "google123", "guest123", "iloveyou", "iloveyou1", "instagram", "internet", "iphone12",
  "jennifer", "jesus123", "jesuschrist", "karibu123", "karibuni", "kilimanjaro", "letmein1", "mamampendwa",
  "master12", "michael1", "monkey12", "motdepasse", "mpenzi123", "mungu123", "mungumwema", "mwanza123",
  "nakupenda", "nakupenda1", "nokia123", "p@ssw0rd", "p@ssword", "passw0rd", "password", "password1",
  "password12", "password123", "password2025", "password2026", "passwort", "princess", "qazwsxedc", "qwerty123",
  "qwerty12345", "qwertyui", "qwertyuiop", "rafiki123", "root1234", "samsung1", "secret12", "serengeti",
  "shadow12", "simba123", "simbasc1", "simbasports", "starwars", "summer2026", "sunshine", "superman",
  "tanzania", "tanzania1", "tanzania123", "test1234", "testtest", "trustno1", "welcome1", "welcome123",
  "welcome2026", "whatever", "whatsapp", "yanga123", "yangaafrica", "yangasc1", "youtube1", "zanzibar",
  "zanzibar1", "zxcvbnm1",
]);

/** True for a listed password or an obvious pattern (one repeated character, a digit run). */
export function isCommonPassword(password: string): boolean {
  const p = password.trim().toLowerCase();
  if (COMMON.has(p)) return true;
  if (/^(.)\1+$/.test(p)) return true;
  if (/^\d+$/.test(p) && ("01234567890123456789".includes(p) || "98765432109876543210".includes(p))) return true;
  return false;
}
