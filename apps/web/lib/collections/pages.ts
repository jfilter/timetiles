/**
 * Defines the Payload CMS collection configuration for Pages.
 *
 * This collection is used for creating flexible content pages using a blocks-based
 * system (similar to Wagtail's StreamField). Block types are loaded from the
 * extensible block registry, allowing plugins to add new block types.
 *
 * @module
 */
// Import to trigger block registration
import "../blocks";

import type { CollectionConfig } from "payload";

import { getPayloadBlocks } from "../blocks/registry";
import { createCommonConfig, createCreatedByField, createSlugField, isEditorOrAdmin } from "./shared-fields";

export const Pages: CollectionConfig = {
  slug: "pages",
  ...createCommonConfig(),
  admin: { useAsTitle: "title", defaultColumns: ["title", "slug", "site", "updatedAt"], group: "Content" },
  access: {
    read: () => true,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
    readVersions: isEditorOrAdmin,
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    createSlugField("pages", "title"),
    {
      name: "site",
      type: "relationship",
      relationTo: "sites",
      required: true,
      admin: { description: "Site this page belongs to" },
    },
    { name: "pageBuilder", type: "blocks", required: true, blocks: getPayloadBlocks() },
    {
      name: "layoutOverride",
      type: "relationship",
      relationTo: "layout-templates",
      admin: { description: "Override the site's default layout template for this page" },
    },
    createCreatedByField("User who created this page"),
  ],
};
