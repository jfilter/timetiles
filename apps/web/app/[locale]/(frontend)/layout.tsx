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
import "@/app/styles/app.css";

import bmftrDe from "@timetiles/assets/logos/funding/bmftr-de.svg";
import bmftrEn from "@timetiles/assets/logos/funding/bmftr-en.svg";
import ptfBannerDeDark from "@timetiles/assets/logos/funding/ptf-banner-de-dark.svg";
import ptfBannerDeLight from "@timetiles/assets/logos/funding/ptf-banner-de-light.svg";
import ptfBannerEnDark from "@timetiles/assets/logos/funding/ptf-banner-en-dark.svg";
import ptfBannerEnLight from "@timetiles/assets/logos/funding/ptf-banner-en-light.svg";
import LogoCompactDark from "@timetiles/assets/logos/latest/dark/transparent/png/wordmark_compact_512.png";
import LogoCompactLight from "@timetiles/assets/logos/latest/light/transparent/png/wordmark_compact_512.png";
import {
  Footer,
  FooterBottom,
  FooterBrand,
  FooterColumn,
  FooterContent,
  FooterLink,
  FooterLinks,
  FooterLogo,
  FooterSection,
  FooterSectionTitle,
  FooterTagline,
} from "@timetiles/ui";
import type { Metadata } from "next";
import { DM_Sans, Inter, JetBrains_Mono, Playfair_Display, Space_Mono } from "next/font/google";
import { headers } from "next/headers";
import Image from "next/image";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { ConditionalTopMenuBar } from "@/app/_components/conditional-top-menu-bar";
import { EnvironmentBanner } from "@/components/environment-banner";
import { IconMapper } from "@/components/icon-mapper";
import { NewsletterFormClient } from "@/components/newsletter-form-client";
import { Providers } from "@/components/providers";
import { SiteBranding } from "@/components/site-branding";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { SiteProvider } from "@/lib/context/site-context";
import { sanitizeHTML } from "@/lib/security/html-sanitizer";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import config from "@/payload.config";
import type { Branding, Footer as FooterType } from "@/payload-types";

interface ImportedAsset {
  src: string;
}

const fontSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const fontSerif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

const fontMono = Space_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "700"], display: "swap" });

// Modern theme fonts (loaded alongside cartographic fonts — CSS variables switch which is active)
const fontInter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fontJetBrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const resolveImportedAssetSrc = (asset: string | ImportedAsset): string =>
  typeof asset === "string" ? asset : asset.src;

const bmftrDeSrc = resolveImportedAssetSrc(bmftrDe);
const bmftrEnSrc = resolveImportedAssetSrc(bmftrEn);
const ptfBannerDeDarkSrc = resolveImportedAssetSrc(ptfBannerDeDark);
const ptfBannerDeLightSrc = resolveImportedAssetSrc(ptfBannerDeLight);
const ptfBannerEnDarkSrc = resolveImportedAssetSrc(ptfBannerEnDark);
const ptfBannerEnLightSrc = resolveImportedAssetSrc(ptfBannerEnLight);

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
        { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png" }],
    },
  };
};

interface SiteFooterProps {
  footerData: FooterType;
  locale: Locale;
  footerMessages: { fundingText: string; bmftrAlt: string; openSource: string; madeIn: string };
  newsletterMessages: { success: string; error: string; networkError: string };
  newsletterButtonLabels: { submitting: string; submitted: string };
}

const SiteFooter = ({
  footerData,
  locale,
  footerMessages,
  newsletterMessages,
  newsletterButtonLabels,
}: Readonly<SiteFooterProps>) => {
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
                  className="text-foreground/60 hover:text-primary dark:text-background/60 dark:hover:text-background transition-colors"
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
            <NewsletterFormClient
              headline={footerData.newsletter.headline ?? "Stay Mapped In"}
              placeholder={footerData.newsletter.placeholder ?? "your@email.address"}
              buttonText={footerData.newsletter.buttonText ?? "Subscribe"}
              messages={newsletterMessages}
              buttonLabels={newsletterButtonLabels}
            />
          </FooterColumn>
        )}
      </FooterContent>
      <FooterBottom>
        <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-4">
            <a href="https://prototypefund.de" target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={locale === "de" ? ptfBannerDeLightSrc : ptfBannerEnLightSrc}
                alt={locale === "de" ? "Unterstützt durch Prototype Fund" : "Supported by Prototype Fund"}
                className="h-16 w-auto dark:hidden"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={locale === "de" ? ptfBannerDeDarkSrc : ptfBannerEnDarkSrc}
                alt={locale === "de" ? "Unterstützt durch Prototype Fund" : "Supported by Prototype Fund"}
                className="hidden h-16 w-auto dark:block"
              />
            </a>
            <a href="https://www.bmftr.bund.de" target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={locale === "de" ? bmftrDeSrc : bmftrEnSrc}
                alt={footerMessages.bmftrAlt}
                className="h-16 w-auto"
              />
            </a>
            <span className="text-muted-foreground text-xs">{footerMessages.fundingText}</span>
          </div>
          <span className="text-muted-foreground text-sm">
            <a
              href="https://github.com/jfilter/timetiles/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {footerMessages.openSource}
            </a>
            {` · ${footerMessages.madeIn}`}
          </span>
        </div>
      </FooterBottom>
    </Footer>
  );
};

export default async function FrontendLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages, tNewsletter, tFooter] = await Promise.all([
    getLocale() as Promise<Locale>,
    getMessages(),
    getTranslations("Newsletter"),
    getTranslations("Footer"),
  ]);
  const footerData = await getFooterData(locale);
  const newsletterMessages = {
    success: tNewsletter("success"),
    error: tNewsletter("error"),
    networkError: tNewsletter("networkError"),
  };
  const footerMessages = {
    fundingText: tFooter("fundingText"),
    bmftrAlt: tFooter("bmftrAlt"),
    openSource: tFooter("openSource"),
    madeIn: tFooter("madeIn"),
  };
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
      <head />
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} ${fontInter.variable} ${fontJetBrains.variable} font-sans antialiased`}
        data-site={site?.slug ?? undefined}
        suppressHydrationWarning
      >
        {/* Apply theme preset classes before paint to prevent FOUC.
            Uses next/script beforeInteractive inside <body> as recommended for App Router. */}
        <Script
          id="theme-preset"
          strategy="beforeInteractive"
        >{`(function(){try{var p=localStorage.getItem("timetiles-theme-preset");if(p&&p!=="cartographic"){document.documentElement.classList.add("theme-"+p);document.body.classList.add("theme-"+p)}}catch(e){}})()`}</Script>
        {bodyStartHtmlContent && <div dangerouslySetInnerHTML={bodyStartHtmlContent} />}
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SiteProvider site={site}>
              <EnvironmentBanner />
              <SiteBranding />
              <ConditionalTopMenuBar />
              {children}
              <SiteFooter
                footerData={footerData}
                locale={locale}
                footerMessages={footerMessages}
                newsletterMessages={newsletterMessages}
                newsletterButtonLabels={{
                  submitting: tNewsletter("subscribing"),
                  submitted: tNewsletter("subscribed"),
                }}
              />
            </SiteProvider>
          </Providers>
        </NextIntlClientProvider>
        {bodyEndHtmlContent && <div dangerouslySetInnerHTML={bodyEndHtmlContent} />}
      </body>
    </html>
  );
}
