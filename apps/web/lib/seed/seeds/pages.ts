/**
 * This file contains the seed data for the Pages collection.
 *
 * It defines a set of predefined pages with titles, slugs, and blocks content.
 * This data is used to populate the database with essential static pages like "Home",
 * "About", and "Contact", ensuring that the application has a baseline of content
 * available immediately after seeding, which is useful for development and testing.
 *
 * @module
 */
import type { Page } from "@/payload-types";

export type PageSeed = Omit<Page, "id" | "createdAt" | "updatedAt">;

export const pagesSeed: PageSeed[] = [
  {
    title: "Home",
    slug: "home",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Explore Your Geodata with TimeTiles",
        subtitle: "An open source platform to visualize, analyze, and interact with spatial and temporal data",
        description:
          "TimeTiles lets you map, filter, and discover patterns in your geodata, making it easy to turn raw location data into actionable insights.",
        background: "grid",
        buttons: [
          {
            text: "Get Started",
            link: "/explore",
            variant: "default",
          },
          {
            text: "Learn More",
            link: "/about",
            variant: "outline",
          },
        ],
      },
      {
        blockType: "features",
        sectionTitle: "Powerful Features",
        sectionDescription: "Everything you need to work with geospatial data",
        columns: "3",
        features: [
          {
            icon: "map",
            title: "Interactive Maps",
            description:
              "Upload your geodata and instantly see it on beautiful, interactive maps. Pan, zoom, and explore your data in space and time.",
            accent: "primary",
          },
          {
            icon: "timeline",
            title: "Temporal Analysis",
            description:
              "Animate your data over time, filter by date ranges, and uncover trends and movements in your spatial datasets.",
            accent: "secondary",
          },
          {
            icon: "insights",
            title: "Powerful Insights",
            description:
              "Use built-in analytics to cluster, summarize, and extract meaning from your geodata. Share your findings with interactive dashboards.",
            accent: "accent",
          },
        ],
      },
      {
        blockType: "stats",
        stats: [
          {
            value: "10,000+",
            label: "Events Mapped",
            icon: "map",
          },
          {
            value: "500+",
            label: "Datasets Imported",
            icon: "timeline",
          },
          {
            value: "100%",
            label: "Open Source",
            icon: "github",
          },
        ],
      },
      {
        blockType: "newsletterCTA",
        headline: "Never Miss a Discovery",
        description:
          "Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.",
        placeholder: "your@email.address",
        buttonText: "Subscribe to Updates",
        variant: "default",
        size: "default",
      },
      {
        blockType: "cta",
        headline: "Ready to explore your data?",
        description: "Start visualizing and analyzing your geospatial data today",
        buttonText: "Start Exploring",
        buttonLink: "/explore",
      },
    ],
  },
  {
    title: "About",
    slug: "about",
    pageBuilder: [
      {
        blockType: "hero",
        title: "About TimeTiles",
        subtitle: "An open source platform for geospatial event management",
        background: "grid",
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles is an open source project built to solve a real problem: managing and visualizing events with both location and time components. Whether you're tracking community events, analyzing historical data, or building a timeline of geolocated activities, TimeTiles provides the tools you need.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "As a solo developer project, TimeTiles prioritizes practical features over enterprise complexity. The platform combines modern web technologies (Next.js, Payload CMS, PostGIS) with a focus on developer experience and extensibility.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "The project is completely open source and welcomes contributions. Whether you're fixing bugs, adding features, improving documentation, or suggesting new ideas, your input helps make TimeTiles better for everyone.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
      {
        blockType: "features",
        sectionTitle: "Core Capabilities",
        columns: "3",
        features: [
          {
            icon: "map",
            title: "Flexible Import",
            description:
              "Import events from CSV/Excel files or set up automated imports from URLs. Smart schema detection and geocoding make data ingestion seamless.",
            accent: "primary",
          },
          {
            icon: "timeline",
            title: "Spatial & Temporal",
            description:
              "Interactive maps with clustering, timeline visualization with histograms, and powerful filtering to explore events across both space and time.",
            accent: "secondary",
          },
          {
            icon: "insights",
            title: "Modern Stack",
            description:
              "Built with Next.js 16, Payload CMS 3, PostGIS, and MapLibre GL JS. Self-hostable with Docker, fully typed with TypeScript.",
            accent: "accent",
          },
        ],
      },
      {
        blockType: "timeline",
        sectionTitle: "Project Journey",
        items: [
          {
            date: "2024",
            title: "Initial Development",
            description:
              "Started as a solution for managing location-based events. Built core import system, geocoding, and map visualization.",
          },
          {
            date: "2024",
            title: "PostGIS Integration",
            description:
              "Added PostGIS for efficient spatial queries, server-side clustering, and geospatial analysis capabilities.",
          },
          {
            date: "2024",
            title: "Temporal Features",
            description:
              "Implemented timeline visualization, histogram aggregation, and temporal filtering to explore events over time.",
          },
          {
            date: "2025",
            title: "Open Source Release",
            description:
              "Released under open source license. Community contributions welcome for features, documentation, and testing.",
          },
        ],
      },
      {
        blockType: "testimonials",
        sectionTitle: "What Makes It Different",
        variant: "grid",
        items: [
          {
            quote:
              "A practical platform for managing events with geospatial and temporal components, without enterprise complexity.",
            author: "Design Philosophy",
            role: "Core Principle",
          },
          {
            quote:
              "Built with modern technologies and best practices. Fully typed, well-tested, and designed for self-hosting.",
            author: "Technical Foundation",
            role: "Architecture",
          },
          {
            quote:
              "Open source and community-driven. Contributions, feedback, and ideas welcome from developers and users alike.",
            author: "Open Development",
            role: "Community",
          },
        ],
      },
      {
        blockType: "cta",
        headline: "Want to contribute or learn more?",
        description: "Check out the GitHub repository for code, documentation, and contribution guidelines",
        buttonText: "View on GitHub",
        buttonLink: "https://github.com/jfilter/timetiles",
      },
    ],
  },
  {
    title: "Contact",
    slug: "contact",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Get in Touch",
        subtitle: "Questions, ideas, or contributions welcome",
        background: "grid",
      },
      {
        blockType: "detailsGrid",
        variant: "grid-3",
        items: [
          {
            icon: "github",
            label: "GitHub Issues",
            value: "Best for bug reports, feature requests, and technical questions",
            link: "https://github.com/jfilter/timetiles/issues",
          },
          {
            icon: "github",
            label: "GitHub Discussions",
            value: "Community chat, ideas, and general questions",
            link: "https://github.com/jfilter/timetiles/discussions",
          },
          {
            icon: "email",
            label: "Email",
            value: "hello@timetiles.io",
            link: "mailto:hello@timetiles.io",
          },
        ],
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles is an open source project maintained by a solo developer. For the fastest response and to help others with similar questions, please use GitHub Issues or Discussions.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Found a bug? Have an idea for a feature? Want to contribute code or documentation? The GitHub repository is the place to collaborate. All contributions are welcome, whether it's code, documentation, testing, or design.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
      {
        blockType: "newsletterForm",
        headline: "Stay Updated",
        placeholder: "your@email.address",
        buttonText: "Subscribe",
      },
      {
        blockType: "cta",
        headline: "Ready to dive in?",
        description: "Star the repository, fork it, or open your first issue",
        buttonText: "View on GitHub",
        buttonLink: "https://github.com/jfilter/timetiles",
      },
    ],
  },
];
