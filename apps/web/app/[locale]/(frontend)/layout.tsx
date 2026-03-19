/**
 * This file defines the layout for frontend routes (non-admin pages).
 *
 * It sets up the basic HTML structure, including the `<html>` and `<body>` tags.
 * It also configures the application's fonts using `next/font` and wraps the children
 * in a `Providers` component, which contains context providers for state management,
 * theming, and other global concerns. The `ConditionalTopMenuBar` is also included here,
 * along with the site footer.
 * @module
 */
import "@timetiles/ui/globals.css";

import LogoCompactDark from "@timetiles/assets/logos/latest/dark/no-grid/png/wordmark_compact_512.png";
import LogoCompactLight from "@timetiles/assets/logos/latest/light/no-grid/png/wordmark_compact_512.png";
import {
  Footer,
  FooterBottom,
  FooterBottomContent,
  FooterBrand,
  FooterColumn,
  FooterContent,
  FooterCopyright,
  FooterLink,
  FooterLinks,
  FooterLogo,
  FooterSection,
  FooterSectionTitle,
  FooterTagline,
  NewsletterForm,
} from "@timetiles/ui";
import type { Metadata } from "next";
import { DM_Sans, Playfair_Display, Space_Mono } from "next/font/google";
import { headers } from "next/headers";
import Image from "next/image";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getPayload } from "payload";

import { ConditionalTopMenuBar } from "@/app/_components/conditional-top-menu-bar";
import { IconMapper } from "@/components/icon-mapper";
import { Providers } from "@/components/providers";
import { SiteBranding } from "@/components/site-branding";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { SiteProvider } from "@/lib/context/site-context";
import { sanitizeHTML } from "@/lib/security/html-sanitizer";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import config from "@/payload.config";
import type { Branding, Footer as FooterType } from "@/payload-types";

const fontSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const fontSerif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

const fontMono = Space_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "700"], display: "swap" });

const getFooterData = async (locale: Locale): Promise<FooterType> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({ slug: "footer", locale });
};

const getBranding = async (locale: Locale): Promise<Branding> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({ slug: "branding", locale });
};

export const generateMetadata = async (): Promise<Metadata> => {
  const locale = (await getLocale()) as Locale;
  const branding = await getBranding(locale);
  const payload = await getPayload({ config });
  const headersList = await headers();
  const host = headersList.get("host");
  const site = await resolveSite(payload, host);

  // Site branding title overrides platform branding
  const title = site?.branding?.title ?? branding.siteName ?? "TimeTiles";

  return {
    title,
    description: branding.siteDescription ?? "Making spatial and temporal data analysis accessible to everyone.",
    icons: {
      icon: [
        { url: "/favicon-light.ico", media: "(prefers-color-scheme: light)" },
        { url: "/favicon-dark.ico", media: "(prefers-color-scheme: dark)" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", media: "(prefers-color-scheme: light)" },
        { url: "/apple-touch-icon-dark.png", media: "(prefers-color-scheme: dark)" },
      ],
      other: [
        { rel: "icon", url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { rel: "icon", url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
  };
};

const SiteFooter = ({ footerData }: Readonly<{ footerData: FooterType }>) => {
  return (
    <Footer>
      <FooterContent
        className={`mb-12 grid grid-cols-1 gap-12 ${footerData.newsletter?.enabled ? "md:grid-cols-6" : "md:grid-cols-5"}`}
      >
        <FooterBrand className="md:col-span-2">
          <FooterLogo>
            <Link href="/">
              <Image
                src={LogoCompactLight}
                alt="TimeTiles"
                className="h-16 w-auto dark:hidden"
                width={739}
                height={334}
              />
              <Image
                src={LogoCompactDark}
                alt="TimeTiles"
                className="hidden h-16 w-auto dark:block"
                width={739}
                height={334}
              />
            </Link>
          </FooterLogo>
          <FooterTagline>{footerData.tagline}</FooterTagline>
          {footerData.socialLinks && footerData.socialLinks.length > 0 && (
            <div className="mt-6 flex gap-4">
              {footerData.socialLinks.map((social) => (
                <Link
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-charcoal/60 hover:text-navy dark:text-parchment/60 dark:hover:text-parchment transition-colors"
                  aria-label={`Visit us on ${social.platform}`}
                >
                  <IconMapper name={social.platform} size={20} />
                </Link>
              ))}
            </div>
          )}
        </FooterBrand>
        {footerData.columns?.slice(0, footerData.newsletter?.enabled ? 2 : 3).map((column) => (
          <FooterColumn key={column.id}>
            <FooterSection>
              <FooterSectionTitle>{column.title}</FooterSectionTitle>
              <FooterLinks>
                {column.links?.map((link) => (
                  <FooterLink key={link.id}>
                    <Link href={link.url}>{link.label}</Link>
                  </FooterLink>
                ))}
              </FooterLinks>
            </FooterSection>
          </FooterColumn>
        ))}
        {footerData.newsletter?.enabled && (
          <FooterColumn className="md:col-span-2">
            <NewsletterForm
              headline={footerData.newsletter.headline ?? "Stay Mapped In"}
              placeholder={footerData.newsletter.placeholder ?? "your@email.address"}
              buttonText={footerData.newsletter.buttonText ?? "Subscribe"}
            />
          </FooterColumn>
        )}
      </FooterContent>
      <FooterBottom>
        <FooterBottomContent>
          <FooterCopyright>{footerData.copyright}</FooterCopyright>
          {footerData.credits && <p className="text-muted-foreground text-sm">{footerData.credits}</p>}
        </FooterBottomContent>
      </FooterBottom>
    </Footer>
  );
};

export default async function FrontendLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale() as Promise<Locale>, getMessages()]);
  const footerData = await getFooterData(locale);
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} font-sans antialiased`}
        data-site={site?.slug ?? undefined}
      >
        {bodyStartHtmlContent && <div dangerouslySetInnerHTML={bodyStartHtmlContent} />}
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SiteProvider site={site}>
              <SiteBranding />
              <ConditionalTopMenuBar />
              {children}
              <SiteFooter footerData={footerData} />
            </SiteProvider>
          </Providers>
        </NextIntlClientProvider>
        {bodyEndHtmlContent && <div dangerouslySetInnerHTML={bodyEndHtmlContent} />}
      </body>
    </html>
  );
}
