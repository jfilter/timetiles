/**
 * Defines the Payload CMS global configuration for the Footer.
 *
 * Globals in Payload are used for managing site-wide settings that don't belong to a specific
 * collection. This configuration defines the structure of the footer content, allowing
 * administrators to manage the footer sections, links, and copyright information.
 *
 * @module
 */
import type { GlobalConfig } from "payload";

export const Footer: GlobalConfig = {
  slug: "footer",
  versions: {
    drafts: {
      autosave: true,
    },
    max: 0, // Keep all versions
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "tagline",
      type: "text",
      required: true,
      admin: {
        description: "Brief tagline or description for your brand",
      },
    },
    {
      name: "socialLinks",
      type: "array",
      maxRows: 6,
      admin: {
        description: "Social media links (e.g., Twitter, GitHub, LinkedIn)",
      },
      fields: [
        {
          name: "platform",
          type: "select",
          required: true,
          options: [
            { label: "X (Twitter)", value: "x" },
            { label: "Bluesky", value: "bluesky" },
            { label: "Mastodon", value: "mastodon" },
            { label: "GitHub", value: "github" },
            { label: "LinkedIn", value: "linkedin" },
            { label: "Facebook", value: "facebook" },
            { label: "Instagram", value: "instagram" },
            { label: "YouTube", value: "youtube" },
          ],
        },
        {
          name: "url",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "columns",
      type: "array",
      maxRows: 3,
      fields: [
        {
          name: "title",
          type: "text",
          required: true,
        },
        {
          name: "links",
          type: "array",
          maxRows: 10,
          fields: [
            {
              name: "label",
              type: "text",
              required: true,
            },
            {
              name: "url",
              type: "text",
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "copyright",
      type: "text",
      required: true,
      admin: {
        description: "Copyright text (e.g., © 2024 TimeTiles. All rights reserved.)",
      },
    },
    {
      name: "credits",
      type: "text",
      admin: {
        description: "Optional credits or attribution text",
      },
    },
  ],
};
