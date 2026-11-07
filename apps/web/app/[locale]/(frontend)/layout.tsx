/**
 * This file defines the layout for frontend routes (non-admin pages).
 *
 * It sets up the basic HTML structure, including the `<html>` and `<body>` tags.
 * It also configures the application's fonts using `next/font` and wraps the children
 * in a `Providers` component, which contains context providers for state management,
 * theming, and other global concerns. Header and footer come from the child layouts:
 * `(app)/layout.tsx` for app routes, `PageChrome` for CMS pages and the 404 page.
 * @module
 */
import "@/app/styles/app.css";

import type { Metadata } from "next";
import { DM_Sans, Inter, JetBrains_Mono, Playfair_Display, Space_Mono } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getPayload } from "payload";

import { EnvironmentBanner } from "@/components/environment-banner";
import { Providers } from "@/components/providers";
import { SiteBranding } from "@/components/site-branding";
import type { Locale } from "@/i18n/config";
import { THEME_PRESET_INIT_SCRIPT } from "@/lib/constants/theme-presets";
import { SiteProvider } from "@/lib/context/site-context";
import { buildFaviconIcons } from "@/lib/metadata/favicon-icons";
import { buildCustomHeadElements } from "@/lib/security/head-html";
import { sanitizeHTML } from "@/lib/security/html-sanitizer";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import config from "@/payload.config";

const fontSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const fontSerif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

const fontMono = Space_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "700"], display: "swap" });

// Modern theme fonts (loaded alongside cartographic fonts — CSS variables switch which is active)
const fontInter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fontJetBrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const generateMetadata = async (): Promise<Metadata> => {
  const [locale, payload, headersList] = await Promise.all([
    getLocale() as Promise<Locale>,
    getPayload({ config }),
    headers(),
  ]);
  const host = headersList.get("host");
  const [branding, site] = await Promise.all([
    payload.findGlobal({ slug: "branding", locale }),
    resolveSite(payload, host),
  ]);

  // Site branding title overrides platform branding
  const title = site?.branding?.title ?? branding.siteName ?? "TimeTiles";

  return {
    title,
    description: branding.siteDescription ?? "Making spatial and temporal data analysis accessible to everyone.",
    icons: buildFaviconIcons({ branding, site }),
  };
};

export default async function FrontendLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale() as Promise<Locale>, getMessages()]);
  const payload = await getPayload({ config });
  const headersList = await headers();
  const host = headersList.get("host");
  const site = await resolveSite(payload, host);

  // Pre-build dangerouslySetInnerHTML objects outside JSX to satisfy react-perf/jsx-no-new-object-as-prop
  const bodyStartHtmlContent = site?.customCode?.bodyStartHtml
    ? { __html: sanitizeHTML(site.customCode.bodyStartHtml) }
    : undefined;
  const bodyEndHtmlContent = site?.customCode?.bodyEndHtml
    ? { __html: sanitizeHTML(site.customCode.bodyEndHtml) }
    : undefined;

  // Admin-authored head HTML is parsed into real elements — raw HTML cannot be
  // injected into <head> without breaking out of it. See lib/security/head-html.ts.
  const customHeadElements = buildCustomHeadElements(site?.customCode?.headHtml);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>{customHeadElements}</head>
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} ${fontInter.variable} ${fontJetBrains.variable} font-sans antialiased`}
        data-site={site?.slug ?? undefined}
        suppressHydrationWarning
      >
        {/* Apply theme preset classes before paint to prevent FOUC.
            Uses next/script beforeInteractive inside <body> as recommended for App Router. */}
        <Script id="theme-preset" strategy="beforeInteractive">
          {THEME_PRESET_INIT_SCRIPT}
        </Script>
        {bodyStartHtmlContent && <div dangerouslySetInnerHTML={bodyStartHtmlContent} />}
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SiteProvider site={site}>
              <EnvironmentBanner />
              <SiteBranding />
              {children}
            </SiteProvider>
          </Providers>
        </NextIntlClientProvider>
        {bodyEndHtmlContent && <div dangerouslySetInnerHTML={bodyEndHtmlContent} />}
      </body>
    </html>
  );
}
