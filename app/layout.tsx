import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { publicDictionary } from "@/lib/i18n/clientDictionary";
import { cookies } from "next/headers";
import { getServerDictionary } from "@/lib/i18n/server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// The approved design (2026-09-26) uses Plus Jakarta Sans throughout.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-app" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: { default: t.app.name, template: `%s · ${t.app.name}` }, description: t.app.tagline };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111a2c" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ t, locale }, jar] = await Promise.all([getServerDictionary(), cookies()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} className={sans.variable} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <I18nProvider t={publicDictionary(t)} locale={locale}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
