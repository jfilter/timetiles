/**
 * Defines the Payload CMS collection for Theme Presets.
 *
 * Themes store named, reusable visual configurations (colors, typography, style)
 * that can be assigned to Sites via a relationship field. Payload's built-in
 * versioning provides theme rollback.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, createCreatedByField, isEditorOrAdmin } from "./shared-fields";

const colorField = (name: string, description: string) => ({ name, type: "text", admin: { description } }) as const;

export const Themes: CollectionConfig = {
  slug: "themes",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "description", "updatedAt"],
    group: "Configuration",
    description: "Reusable theme presets for site branding",
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
      admin: { description: "Theme name (e.g., 'City Government Blue')" },
    },
    { name: "description", type: "textarea", admin: { description: "Brief description of this theme's visual style" } },

    // ============ COLORS (LIGHT MODE) ============
    {
      type: "group",
      name: "colors",
      label: "Colors (Light Mode)",
      admin: { description: "Semantic color tokens for light mode" },
      fields: [
        colorField("primary", "Primary color — navigation, headings"),
        colorField("primaryForeground", "Text on primary color"),
        colorField("secondary", "Secondary accent color"),
        colorField("secondaryForeground", "Text on secondary color"),
        colorField("background", "Page background color"),
        colorField("foreground", "Default text color"),
        colorField("card", "Card background color"),
        colorField("cardForeground", "Card text color"),
        colorField("muted", "Muted/subtle background"),
        colorField("mutedForeground", "Muted text color"),
        colorField("accent", "Accent color — success states, highlights"),
        colorField("accentForeground", "Text on accent color"),
        colorField("destructive", "Destructive/error color"),
        colorField("border", "Border color"),
        colorField("ring", "Focus ring color"),
      ],
    },

    // ============ COLORS (DARK MODE) ============
    {
      type: "group",
      name: "darkColors",
      label: "Colors (Dark Mode)",
      admin: { description: "Override tokens for dark mode (leave empty to auto-derive)" },
      fields: [
        colorField("primary", "Primary color in dark mode"),
        colorField("primaryForeground", "Text on primary in dark mode"),
        colorField("secondary", "Secondary color in dark mode"),
        colorField("secondaryForeground", "Text on secondary in dark mode"),
        colorField("background", "Background in dark mode"),
        colorField("foreground", "Text color in dark mode"),
        colorField("card", "Card background in dark mode"),
        colorField("cardForeground", "Card text in dark mode"),
        colorField("muted", "Muted background in dark mode"),
        colorField("mutedForeground", "Muted text in dark mode"),
        colorField("accent", "Accent color in dark mode"),
        colorField("accentForeground", "Text on accent in dark mode"),
        colorField("destructive", "Destructive color in dark mode"),
        colorField("border", "Border color in dark mode"),
        colorField("ring", "Focus ring in dark mode"),
      ],
    },

    // ============ TYPOGRAPHY ============
    {
      type: "group",
      name: "typography",
      label: "Typography",
      fields: [
        {
          name: "fontPairing",
          type: "select",
          admin: { description: "Font pairing for headings and body text" },
          options: [
            { label: "Editorial (Playfair Display + DM Sans)", value: "editorial" },
            { label: "Modern (Inter + Geist Sans)", value: "modern" },
            { label: "Monospace (Space Mono + IBM Plex Mono)", value: "monospace" },
          ],
        },
      ],
    },

    // ============ STYLE ============
    {
      type: "group",
      name: "style",
      label: "Visual Style",
      fields: [
        {
          name: "borderRadius",
          type: "select",
          admin: { description: "Corner rounding for UI elements" },
          options: [
            { label: "Sharp (0px)", value: "sharp" },
            { label: "Rounded (4px)", value: "rounded" },
            { label: "Pill (16px)", value: "pill" },
          ],
        },
        {
          name: "density",
          type: "select",
          admin: { description: "Spacing density for UI elements" },
          options: [
            { label: "Compact", value: "compact" },
            { label: "Default", value: "default" },
            { label: "Comfortable", value: "comfortable" },
          ],
        },
      ],
    },

    createCreatedByField("User who created this theme"),
  ],
};
