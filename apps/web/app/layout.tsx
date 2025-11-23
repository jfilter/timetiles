/**
 * This file defines the root layout for the entire application.
 *
 * It sets up the basic HTML structure, including the `<html>` and `<body>` tags.
 * It also configures the application's fonts using `next/font` and wraps the children
 * in a `Providers` component, which likely contains context providers for state management,
 * theming, and other global concerns. The `ConditionalTopMenuBar` is also included here,
 * suggesting that the main navigation is part of this root layout.
 * @module
 */
import "@timetiles/ui/globals.css";

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
} from "@timetiles/ui";
import { DM_Sans, Playfair_Display, Space_Mono } from "next/font/google";
import Link from "next/link";
import { getPayload } from "payload";

import { ConditionalTopMenuBar } from "@/app/_components/conditional-top-menu-bar";
import { IconMapper } from "@/components/icon-mapper";
import { Providers } from "@/components/providers";
import config from "@/payload.config";
import type { Footer as FooterType } from "@/payload-types";

const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontSerif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const fontMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
  display: "swap",
});

const getFooterData = async (): Promise<FooterType> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({
    slug: "footer",
  });
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const footerData = await getFooterData();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} font-sans antialiased`}>
        <Providers>
          <ConditionalTopMenuBar />
          {children}
          <Footer>
            <FooterContent className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-5">
              <FooterBrand className="md:col-span-2">
                <FooterLogo>
                  <Link href="/" className="text-foreground font-serif text-2xl font-bold">
                    TimeTiles
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
              {footerData.columns?.slice(0, 3).map((column) => (
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
            </FooterContent>
            <FooterBottom>
              <FooterBottomContent>
                <FooterCopyright>{footerData.copyright}</FooterCopyright>
                {footerData.credits && <p className="text-muted-foreground text-sm">{footerData.credits}</p>}
              </FooterBottomContent>
            </FooterBottom>
          </Footer>
        </Providers>
      </body>
    </html>
  );
}
