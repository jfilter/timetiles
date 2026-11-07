/**
 * Site footers rendered below page content.
 *
 * `SiteFooter` is the full footer (brand, link columns, newsletter, funding);
 * `CompactSiteFooter` shows only the copyright line from the Footer global.
 *
 * @module
 * @category Components
 */
import bmftrDe from "@timetiles/assets/logos/funding/bmftr-de.svg";
import bmftrEn from "@timetiles/assets/logos/funding/bmftr-en.svg";
import ptfBannerDeDark from "@timetiles/assets/logos/funding/ptf-banner-de-dark.svg";
import ptfBannerDeLight from "@timetiles/assets/logos/funding/ptf-banner-de-light.svg";
import ptfBannerEnDark from "@timetiles/assets/logos/funding/ptf-banner-en-dark.svg";
import ptfBannerEnLight from "@timetiles/assets/logos/funding/ptf-banner-en-light.svg";
import LogoCompactDark from "@timetiles/assets/logos/latest/dark/transparent/wordmark_compact.svg";
import LogoCompactLight from "@timetiles/assets/logos/latest/light/transparent/wordmark_compact.svg";
import {
  Footer,
  FooterBottom,
  FooterBrand,
  FooterColumn,
  FooterCompact,
  FooterContent,
  FooterLink,
  FooterLinks,
  FooterLogo,
  FooterSection,
  FooterSectionTitle,
  FooterTagline,
} from "@timetiles/ui";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { IconMapper } from "@/components/icon-mapper";
import { NewsletterFormClient } from "@/components/newsletter-form-client";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import config from "@/payload.config";
import type { Footer as FooterType } from "@/payload-types";

const getFooterData = async (locale: Locale): Promise<FooterType> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({ slug: "footer", locale });
};

interface FullFooterProps {
  footerData: FooterType;
  locale: Locale;
  footerMessages: {
    fundingText: string;
    bmftrAlt: string;
    openSource: string;
    madeIn: string;
    visitUsOn: (platform: string) => string;
  };
  newsletterMessages: { success: string; error: string; networkError: string };
  newsletterButtonLabels: { submitting: string; submitted: string };
}

const FullFooter = ({
  footerData,
  locale,
  footerMessages,
  newsletterMessages,
  newsletterButtonLabels,
}: Readonly<FullFooterProps>) => {
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
                  aria-label={footerMessages.visitUsOn(social.platform)}
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
              <Image
                src={locale === "de" ? ptfBannerDeLight : ptfBannerEnLight}
                alt={locale === "de" ? "Unterstützt durch Prototype Fund" : "Supported by Prototype Fund"}
                className="h-16 w-auto dark:hidden"
                width={850}
                height={567}
              />
              <Image
                src={locale === "de" ? ptfBannerDeDark : ptfBannerEnDark}
                alt={locale === "de" ? "Unterstützt durch Prototype Fund" : "Supported by Prototype Fund"}
                className="hidden h-16 w-auto dark:block"
                width={850}
                height={567}
              />
            </a>
            <a href="https://www.bmftr.bund.de" target="_blank" rel="noopener noreferrer">
              <Image
                src={locale === "de" ? bmftrDe : bmftrEn}
                alt={footerMessages.bmftrAlt}
                className="h-16 w-auto"
                width={214}
                height={142}
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

export const SiteFooter = async () => {
  const locale = (await getLocale()) as Locale;
  const [footerData, tNewsletter, tFooter] = await Promise.all([
    getFooterData(locale),
    getTranslations("Newsletter"),
    getTranslations("Footer"),
  ]);
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
    visitUsOn: (platform: string) => tFooter("visitUsOn", { platform }),
  };

  return (
    <FullFooter
      footerData={footerData}
      locale={locale}
      footerMessages={footerMessages}
      newsletterMessages={newsletterMessages}
      newsletterButtonLabels={{ submitting: tNewsletter("subscribing"), submitted: tNewsletter("subscribed") }}
    />
  );
};

export const CompactSiteFooter = async () => {
  const footerData = await getFooterData((await getLocale()) as Locale);
  return <FooterCompact>{footerData.copyright}</FooterCompact>;
};
