import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getDictionary, isLocale, type Dictionary, type Locale } from "./dictionaries";

export const LOCALE_COOKIE = "gobig_locale";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getServerDictionary(): Promise<{ t: Dictionary; locale: Locale }> {
  const locale = await getLocale();
  return { t: getDictionary(locale), locale };
}
