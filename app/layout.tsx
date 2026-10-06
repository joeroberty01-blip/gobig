import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { publicDictionary } from "@/lib/i18n/clientDictionary";
import { cookies } from "next/headers";
import { getServerDictionary } from "@/lib/i18n/server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// Poppins throughout (owner, 2026-10-06: the earlier font wasn't attractive enough).
const sans = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-app", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: { default: t.app.name, template: `%s · ${t.app.name}` }, description: t.app.tagline };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Light by default (the approved design), even on phones set to dark mode.
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ t, locale }, jar] = await Promise.all([getServerDictionary(), cookies()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} className={sans.variable} data-theme={theme} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <I18nProvider t={publicDictionary(t)} locale={locale}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
