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
import "@workspace/ui/globals.css";

import { Geist, Geist_Mono } from "next/font/google";

import { ConditionalTopMenuBar } from "@/app/_components/conditional-top-menu-bar";
import { Providers } from "@/components/providers";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}>
        <Providers>
          <ConditionalTopMenuBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
