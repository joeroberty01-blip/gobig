// Light/dark choice (Phase 14). Not sensitive, so a plain readable cookie: the switch updates it in
// the browser and the root layout reads it, so the first paint already has the right theme.
export const THEME_COOKIE = "gobig_theme";
export type ThemeChoice = "light" | "dark" | "system";

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
