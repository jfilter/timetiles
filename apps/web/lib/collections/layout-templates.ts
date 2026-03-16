/**
 * Defines the Payload CMS collection for Layout Templates.
 *
 * Layout templates control the structural frame of a page: header variant,
 * footer variant, content max-width, and sticky header behavior. Templates
 * can be assigned to Sites (default) or Pages (override).
 *
 * Hierarchy: Page layoutOverride > Site defaultLayout > platform default
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, createCreatedByField, isEditorOrAdmin } from "./shared-fields";

export const LayoutTemplates: CollectionConfig = {
  slug: "layout-templates",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "headerVariant", "footerVariant", "contentMaxWidth", "updatedAt"],
    group: "Configuration",
    description: "Layout templates controlling page structure (header, footer, width)",
  },
  access: {
    read: () => true,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
    readVersions: isEditorOrAdmin,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      maxLength: 255,
      admin: { description: "Template name (e.g., 'Landing Page', 'Documentation')" },
    },
    { name: "description", type: "textarea", admin: { description: "Brief description of when to use this template" } },

    // ============ HEADER ============
    {
      name: "headerVariant",
      type: "select",
      defaultValue: "marketing",
      admin: { description: "Header style" },
      options: [
        { label: "Marketing (full navigation)", value: "marketing" },
        { label: "App (minimal, app-focused)", value: "app" },
        { label: "Minimal (logo only)", value: "minimal" },
        { label: "None (no header)", value: "none" },
      ],
    },
    {
      name: "stickyHeader",
      type: "checkbox",
      defaultValue: true,
      admin: { description: "Keep header visible when scrolling" },
    },

    // ============ FOOTER ============
    {
      name: "footerVariant",
      type: "select",
      defaultValue: "full",
      admin: { description: "Footer style" },
      options: [
        { label: "Full (brand, columns, newsletter)", value: "full" },
        { label: "Compact (copyright only)", value: "compact" },
        { label: "None (no footer)", value: "none" },
      ],
    },

    // ============ CONTENT ============
    {
      name: "contentMaxWidth",
      type: "select",
      defaultValue: "lg",
      admin: { description: "Maximum content width" },
      options: [
        { label: "Small (max-w-3xl, 768px)", value: "sm" },
        { label: "Medium (max-w-5xl, 1024px)", value: "md" },
        { label: "Large (max-w-6xl, 1152px)", value: "lg" },
        { label: "Extra Large (max-w-7xl, 1280px)", value: "xl" },
        { label: "Full Width", value: "full" },
      ],
    },

    createCreatedByField("User who created this template"),
  ],
};
