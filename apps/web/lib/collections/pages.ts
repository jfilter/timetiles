/**
 * @module Defines the Payload CMS collection configuration for Pages.
 *
 * This collection is used for creating simple, static content pages on the website.
 * Each document represents a single page with a title, a URL-friendly slug,
 * and a rich text content area for the main body of the page.
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, createSlugField } from "./shared-fields";

export const Pages: CollectionConfig = {
  slug: "pages",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "title",
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    createSlugField("pages", "title"),
    {
      name: "content",
      type: "richText",
    },
  ],
};
