/**
 * Defines the Payload CMS collection configuration for Pages.
 *
 * This collection is used for creating flexible content pages using a blocks-based
 * system (similar to Wagtail's StreamField). Each page can contain multiple blocks
 * of different types: Hero, Features, Stats, Contact Methods, Rich Text, and CTAs.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, createSlugField } from "./shared-fields";

const iconOptions = [
  { label: "Email", value: "email" },
  { label: "Business", value: "business" },
  { label: "Support", value: "support" },
  { label: "Location", value: "location" },
  { label: "Map", value: "map" },
  { label: "Timeline", value: "timeline" },
  { label: "Insights", value: "insights" },
];

const accentOptions = [
  { label: "None", value: "none" },
  { label: "Primary", value: "primary" },
  { label: "Secondary", value: "secondary" },
  { label: "Accent", value: "accent" },
  { label: "Muted", value: "muted" },
];

export const Pages: CollectionConfig = {
  slug: "pages",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "title",
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => user?.role === "admin",
    update: ({ req: { user } }) => user?.role === "admin",
    delete: ({ req: { user } }) => user?.role === "admin",
    readVersions: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    createSlugField("pages", "title"),
    {
      name: "pageBuilder",
      type: "blocks",
      required: true,
      blocks: [
        {
          slug: "hero",
          labels: {
            singular: "Hero Section",
            plural: "Hero Sections",
          },
          fields: [
            {
              name: "title",
              type: "text",
              required: true,
            },
            {
              name: "subtitle",
              type: "text",
            },
            {
              name: "description",
              type: "textarea",
            },
            {
              name: "background",
              type: "select",
              defaultValue: "gradient",
              options: [
                { label: "Gradient", value: "gradient" },
                { label: "Grid", value: "grid" },
              ],
            },
            {
              name: "buttons",
              type: "array",
              fields: [
                {
                  name: "text",
                  type: "text",
                  required: true,
                },
                {
                  name: "link",
                  type: "text",
                  required: true,
                },
                {
                  name: "variant",
                  type: "select",
                  defaultValue: "default",
                  options: [
                    { label: "Default", value: "default" },
                    { label: "Outline", value: "outline" },
                  ],
                },
              ],
            },
          ],
        },
        {
          slug: "features",
          labels: {
            singular: "Features Section",
            plural: "Features Sections",
          },
          fields: [
            {
              name: "sectionTitle",
              type: "text",
              label: "Section Title",
            },
            {
              name: "sectionDescription",
              type: "textarea",
              label: "Section Description",
            },
            {
              name: "columns",
              type: "select",
              defaultValue: 3,
              options: [
                { label: "1 Column", value: "1" },
                { label: "2 Columns", value: "2" },
                { label: "3 Columns", value: "3" },
                { label: "4 Columns", value: "4" },
              ],
            },
            {
              name: "features",
              type: "array",
              required: true,
              minRows: 1,
              fields: [
                {
                  name: "icon",
                  type: "select",
                  required: true,
                  options: iconOptions,
                },
                {
                  name: "title",
                  type: "text",
                  required: true,
                },
                {
                  name: "description",
                  type: "textarea",
                  required: true,
                },
                {
                  name: "accent",
                  type: "select",
                  defaultValue: "none",
                  options: accentOptions,
                },
              ],
            },
          ],
        },
        {
          slug: "stats",
          labels: {
            singular: "Stats Section",
            plural: "Stats Sections",
          },
          fields: [
            {
              name: "stats",
              type: "array",
              required: true,
              minRows: 1,
              fields: [
                {
                  name: "value",
                  type: "text",
                  required: true,
                },
                {
                  name: "label",
                  type: "text",
                  required: true,
                },
                {
                  name: "icon",
                  type: "select",
                  options: iconOptions,
                },
              ],
            },
          ],
        },
        {
          slug: "contactMethods",
          labels: {
            singular: "Contact Methods Section",
            plural: "Contact Methods Sections",
          },
          fields: [
            {
              name: "methods",
              type: "array",
              required: true,
              minRows: 1,
              fields: [
                {
                  name: "icon",
                  type: "select",
                  required: true,
                  options: iconOptions,
                },
                {
                  name: "label",
                  type: "text",
                  required: true,
                },
                {
                  name: "value",
                  type: "text",
                  required: true,
                },
                {
                  name: "link",
                  type: "text",
                },
              ],
            },
          ],
        },
        {
          slug: "richText",
          labels: {
            singular: "Rich Text",
            plural: "Rich Text Blocks",
          },
          fields: [
            {
              name: "content",
              type: "richText",
              required: true,
            },
          ],
        },
        {
          slug: "cta",
          labels: {
            singular: "Call to Action",
            plural: "Call to Action Blocks",
          },
          fields: [
            {
              name: "headline",
              type: "text",
              required: true,
            },
            {
              name: "description",
              type: "textarea",
            },
            {
              name: "buttonText",
              type: "text",
              required: true,
            },
            {
              name: "buttonLink",
              type: "text",
              required: true,
            },
          ],
        },
      ],
    },
  ],
};
