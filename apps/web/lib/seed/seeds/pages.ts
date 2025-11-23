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
        subtitle: "Visualize, analyze, and interact with spatial and temporal data",
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
    slug: "/about",
    pageBuilder: [
      {
        blockType: "hero",
        title: "About TimeTiles",
        subtitle: "Making spatial and temporal data analysis accessible to everyone",
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
                    text: "TimeTiles was founded in 2023 with a simple mission: to make spatial and temporal data analysis accessible to everyone. We believe that location data holds incredible insights, but traditional tools are often too complex, expensive, or limited for most users.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Our team of geospatial experts, data scientists, and software engineers has decades of combined experience working with everything from GPS tracking data to satellite imagery. We've seen firsthand how powerful geographic analysis can be, and we've also experienced the frustration of tools that are hard to use or don't scale.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "That's why we built TimeTiles - to bridge the gap between powerful geospatial analysis and everyday usability. Whether you're a researcher studying migration patterns, a business owner optimizing delivery routes, or a city planner analyzing traffic flow, TimeTiles gives you the tools to visualize, analyze, and understand your data.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Our platform handles the complexity behind the scenes - automatic geocoding, spatial indexing, temporal aggregation, and interactive visualization - so you can focus on what matters most: discovering insights in your data.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "We're committed to building tools that are not just powerful, but also intuitive, fast, and reliable. Every feature we add is designed with real users in mind, solving real problems we've encountered in our own work with geodata.",
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
    ],
  },
  {
    title: "Contact",
    slug: "/contact",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Contact Us",
        subtitle: "We'd love to hear from you",
        background: "grid",
      },
      {
        blockType: "contactMethods",
        methods: [
          {
            icon: "email",
            label: "General Inquiries",
            value: "hello@timetiles.com",
            link: "mailto:hello@timetiles.com",
          },
          {
            icon: "business",
            label: "Business & Partnerships",
            value: "business@timetiles.com",
            link: "mailto:business@timetiles.com",
          },
          {
            icon: "support",
            label: "Technical Support",
            value: "support@timetiles.com",
            link: "mailto:support@timetiles.com",
          },
          {
            icon: "location",
            label: "Office Address",
            value: "TimeTiles, Inc.\n1234 Geospatial Way, Suite 500\nSan Francisco, CA 94107",
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
                    text: "Our support team typically responds within 24 hours during business days. For urgent technical issues, please include your account details and a detailed description of the problem you're experiencing.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Interested in a demo or have questions about enterprise features? We offer personalized consultations to help you understand how TimeTiles can fit into your workflow and maximize the value of your geospatial data.",
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
    ],
  },
];
