// Light/dark choice (Phase 14). Not sensitive, so a plain readable cookie: the switch updates it in
// the browser and the root layout reads it, so the first paint already has the right theme.
export const THEME_COOKIE = "gobig_theme";
export type ThemeChoice = "light" | "dark" | "system";

/**
 * Light unless the person chose otherwise: the approved design is light, and following a phone's
 * dark mode by default made the app look unlike it. "system" (follow the device) is an opt-in.
 */
export function parseTheme(value: string | undefined): ThemeChoice {
  return value === "dark" || value === "system" ? value : "light";
}
