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

export const footerSeedDe: FooterSeed = {
  tagline: "Räumliche und zeitliche Datenanalyse für alle zugänglich machen.",
  socialLinks: [
    { platform: "bluesky", url: "https://bsky.app/profile/timetiles.io" },
    { platform: "mastodon", url: "https://fakten.daten.cool/@timetiles" },
    { platform: "github", url: "https://github.com/jfilter/timetiles" },
  ],
  columns: [
    {
      title: "Projekt",
      links: [
        { label: "Funktionen", url: "/features" },
        { label: "Erste Schritte", url: "https://docs.timetiles.io" },
        { label: "Dokumentation", url: "https://docs.timetiles.io" },
        { label: "API-Referenz", url: "https://docs.timetiles.io/reference/api" },
      ],
    },
    {
      title: "Gemeinschaft",
      links: [
        { label: "Über uns", url: "/about" },
        { label: "Mitwirken", url: "https://github.com/jfilter/timetiles/blob/main/CONTRIBUTING.md" },
        { label: "GitHub-Diskussionen", url: "https://github.com/jfilter/timetiles/discussions" },
        { label: "Blog", url: "/blog" },
      ],
    },
    {
      title: "Ressourcen",
      links: [
        { label: "Anleitungen", url: "/tutorials" },
        { label: "Anwendungsfälle", url: "/use-cases" },
        { label: "Roadmap", url: "/roadmap" },
        { label: "Hilfe", url: "https://github.com/jfilter/timetiles/issues" },
        { label: "Datenschutz", url: "/privacy" },
        { label: "Nutzungsbedingungen", url: "/terms" },
      ],
    },
  ],
  newsletter: {
    enabled: true,
    headline: "Immer auf dem Laufenden",
    placeholder: "deine@email.adresse",
    buttonText: "Abonnieren",
  },
  copyright: "© 2024 TimeTiles. Alle Rechte vorbehalten.",
  credits: "Erstellt mit Payload CMS und Next.js",
};

export const footerSeed: FooterSeed = {
  tagline: "Making spatial and temporal data analysis accessible to everyone.",
  socialLinks: [
    { platform: "bluesky", url: "https://bsky.app/profile/timetiles.io" },
    { platform: "mastodon", url: "https://fakten.daten.cool/@timetiles" },
    { platform: "github", url: "https://github.com/jfilter/timetiles" },
  ],
  columns: [
    {
      title: "Project",
      links: [
        { label: "Features", url: "/features" },
        { label: "Get Started", url: "https://docs.timetiles.io" },
        { label: "Documentation", url: "https://docs.timetiles.io" },
        { label: "API Reference", url: "https://docs.timetiles.io/reference/api" },
      ],
    },
    {
      title: "Community",
      links: [
        { label: "About", url: "/about" },
        { label: "Contributing", url: "https://github.com/jfilter/timetiles/blob/main/CONTRIBUTING.md" },
        { label: "GitHub Discussions", url: "https://github.com/jfilter/timetiles/discussions" },
        { label: "Blog", url: "/blog" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Tutorials", url: "/tutorials" },
        { label: "Use Cases", url: "/use-cases" },
        { label: "Roadmap", url: "/roadmap" },
        { label: "Support", url: "https://github.com/jfilter/timetiles/issues" },
        { label: "Privacy Policy", url: "/privacy" },
        { label: "Terms of Service", url: "/terms" },
      ],
    },
  ],
  newsletter: { enabled: true, headline: "Stay Mapped In", placeholder: "your@email.address", buttonText: "Subscribe" },
  copyright: "© 2024 TimeTiles. All rights reserved.",
  credits: "Built with Payload CMS and Next.js",
};
