import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getServerDictionary } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: { default: t.app.name, template: `%s · ${t.app.name}` }, description: t.app.tagline };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a6e53",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getServerDictionary();
  return (
    <html lang={locale} className={inter.variable}>
      <body className="min-h-dvh antialiased">
        <I18nProvider t={t} locale={locale}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
