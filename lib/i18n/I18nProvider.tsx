"use client";

import { createContext, useContext } from "react";
import type { Dictionary, Locale } from "./dictionaries";

type I18nContextValue = { t: Dictionary; locale: Locale };

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ t, locale, children }: I18nContextValue & { children: React.ReactNode }) {
  return <I18nContext.Provider value={{ t, locale }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
