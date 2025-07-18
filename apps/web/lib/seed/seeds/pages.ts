import type { Page } from "../../../payload-types";

export const pagesSeed: Partial<Page>[] = [
  {
    title: "Welcome to TimeTiles",
    slug: "home",
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
                text: "Explore Your Geodata with TimeTiles",
              },
            ],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "text",
                text: "Visualize, analyze, and interact with your spatial and temporal data like never before. TimeTiles lets you map, filter, and discover patterns in your geodata, making it easy to turn raw location data into actionable insights.",
              },
            ],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "text",
                text: "🗺️ Interactive Maps",
              },
            ],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "text",
                text: "Upload your geodata and instantly see it on beautiful, interactive maps. Pan, zoom, and explore your data in space and time.",
              },
            ],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "text",
                text: "⏳ Temporal Analysis",
              },
            ],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "text",
                text: "Animate your data over time, filter by date ranges, and uncover trends and movements in your spatial datasets.",
              },
            ],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "text",
                text: "🔍 Powerful Insights",
              },
            ],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "text",
                text: "Use built-in analytics to cluster, summarize, and extract meaning from your geodata. Share your findings with interactive dashboards.",
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
    title: "About",
    slug: "about",
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
                text: "This is the about page.",
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
    title: "Contact",
    slug: "contact",
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
                text: "This is the contact page.",
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
];
