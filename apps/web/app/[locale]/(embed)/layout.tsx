/**
 * Root layout for embed routes.
 *
 * Renders the minimal shell needed for the explorer: fonts, providers,
 * site context, and theming — but no header, footer, or custom code
 * injection. An {@link EmbedAttribution} bar is rendered after the
 * view content resolves.
 *
 * If the site has `embeddingConfig.allowedOrigins` configured, the layout
 * checks the `Referer` header and refuses to render if the origin is not
 * in the allow-list. This is a server-side check — content never leaves
 * the server for disallowed origins.
 *
 * @module
 */
import "@timetiles/ui/globals.css";

import type { Metadata } from "next";
import { DM_Sans, Playfair_Display, Space_Mono } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { Providers } from "@/components/providers";
import { SiteBranding } from "@/components/site-branding";
import type { Locale } from "@/i18n/config";
import { EmbedProvider } from "@/lib/context/embed-context";
import { SiteProvider } from "@/lib/context/site-context";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import { isEmbedOriginAllowed } from "@/lib/utils/embed";
import config from "@/payload.config";

const fontSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const fontSerif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

const fontMono = Space_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "700"], display: "swap" });

export const generateMetadata = (): Metadata => {
  return { title: "TimeTiles Embed", robots: { index: false, follow: false } };
};

export default async function EmbedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale() as Promise<Locale>, getMessages()]);
  const payload = await getPayload({ config });
  const headersList = await headers();
  const host = headersList.get("host");
  const site = await resolveSite(payload, host);

  // Check origin restrictions before rendering any content
  const referer = headersList.get("referer");
  if (!isEmbedOriginAllowed(site, referer)) {
    const t = await getTranslations("Embed");
    return (
      <html lang={locale} suppressHydrationWarning>
        <body className={`${fontSans.variable} font-sans antialiased`}>
          <div className="flex h-screen items-center justify-center p-4 text-center">
            <p className="text-muted-foreground text-sm">{t("originNotAllowed")}</p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} font-sans antialiased`}
        data-site={site?.slug ?? undefined}
        data-embed="true"
      >
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SiteProvider site={site}>
              <SiteBranding />
              <EmbedProvider>{children}</EmbedProvider>
            </SiteProvider>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
