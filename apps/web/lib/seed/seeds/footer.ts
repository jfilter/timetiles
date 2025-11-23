/**
 * This file contains the seed data for the Footer global.
 *
 * It defines the default footer content including tagline, footer sections with links,
 * copyright information, and credits. This data is used to populate the footer
 * global in the database.
 *
 * @module
 */
import type { Footer } from "@/payload-types";

export type FooterSeed = Omit<Footer, "id" | "createdAt" | "updatedAt">;

export const footerSeed: FooterSeed = {
  tagline: "Making spatial and temporal data analysis accessible to everyone.",
  socialLinks: [
    {
      platform: "x",
      url: "https://x.com/timetiles",
    },
    {
      platform: "bluesky",
      url: "https://bsky.app/profile/timetiles.io",
    },
    {
      platform: "mastodon",
      url: "https://mastodon.social/@timetiles",
    },
    {
      platform: "github",
      url: "https://github.com/timetiles",
    },
  ],
  columns: [
    {
      title: "Product",
      links: [
        {
          label: "Features",
          url: "/features",
        },
        {
          label: "Pricing",
          url: "/pricing",
        },
        {
          label: "Documentation",
          url: "/docs",
        },
        {
          label: "API Reference",
          url: "/api-docs",
        },
      ],
    },
    {
      title: "Company",
      links: [
        {
          label: "About",
          url: "/about",
        },
        {
          label: "Blog",
          url: "/blog",
        },
        {
          label: "Careers",
          url: "/careers",
        },
        {
          label: "Contact",
          url: "/contact",
        },
      ],
    },
    {
      title: "Resources",
      links: [
        {
          label: "Community",
          url: "/community",
        },
        {
          label: "Tutorials",
          url: "/tutorials",
        },
        {
          label: "Use Cases",
          url: "/use-cases",
        },
        {
          label: "Support",
          url: "/support",
        },
        {
          label: "Privacy Policy",
          url: "/privacy",
        },
        {
          label: "Terms of Service",
          url: "/terms",
        },
      ],
    },
  ],
  copyright: "© 2024 TimeTiles. All rights reserved.",
  credits: "Built with Payload CMS and Next.js",
};
