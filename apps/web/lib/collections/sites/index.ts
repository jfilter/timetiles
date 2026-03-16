/**
 * Defines the Sites collection for multi-domain deployment.
 *
 * A Site represents a domain with branding overrides. One TimeTiles
 * deployment can serve multiple domains, each with its own branded
 * experience. Views belong to a site and define data scope/filters.
 *
 * Hierarchy: Branding global (platform defaults) -> Site (per-domain overrides) -> View (data/map config)
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, createCreatedByField, createIsPublicField, createSlugField } from "../shared-fields";
import * as access from "./access";
import { createDefaultView, enforceSingleDefault, invalidateSiteCache, setCreatedBy } from "./hooks";

const Sites: CollectionConfig = {
  slug: "sites",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "domain", "isDefault", "isPublic", "updatedAt"],
    group: "Configuration",
    description: "Configure sites with custom domains and branding",
  },
  access: {
    read: access.read,
    create: access.create,
    update: access.update,
    delete: access.deleteAccess,
    readVersions: access.readVersions,
  },
  hooks: { beforeChange: [setCreatedBy, enforceSingleDefault], afterChange: [invalidateSiteCache, createDefaultView] },
  fields: [
    // ============ IDENTITY ============
    {
      name: "name",
      type: "text",
      required: true,
      maxLength: 255,
      admin: { description: "Internal name for this site" },
    },
    createSlugField("sites"),
    { name: "domain", type: "text", unique: true, admin: { description: "Custom domain (e.g., events.city.gov)" } },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      access: {
        create: ({ req: { user } }) => user?.role === "admin",
        update: ({ req: { user } }) => user?.role === "admin",
      },
      admin: { position: "sidebar", description: "Use as fallback site when no domain match (admin only)" },
    },

    // ============ BRANDING ============
    {
      type: "group",
      name: "branding",
      label: "Branding",
      admin: { description: "Custom branding for this site (overrides platform defaults)" },
      fields: [
        { name: "title", type: "text", admin: { description: "Site title (overrides platform site name)" } },
        { name: "logo", type: "upload", relationTo: "media", admin: { description: "Logo for light theme" } },
        { name: "logoDark", type: "upload", relationTo: "media", admin: { description: "Logo for dark theme" } },
        { name: "favicon", type: "upload", relationTo: "media", admin: { description: "Custom favicon" } },
        {
          name: "colors",
          type: "group",
          admin: { description: "Semantic color overrides (CSS color values, e.g. #3b82f6 or oklch(0.58 0.11 220))" },
          fields: [
            { name: "primary", type: "text", admin: { description: "Primary color — navigation, headings" } },
            { name: "primaryForeground", type: "text", admin: { description: "Text on primary color" } },
            { name: "secondary", type: "text", admin: { description: "Secondary accent color" } },
            { name: "secondaryForeground", type: "text", admin: { description: "Text on secondary color" } },
            { name: "background", type: "text", admin: { description: "Page background color" } },
            { name: "foreground", type: "text", admin: { description: "Default text color" } },
            { name: "card", type: "text", admin: { description: "Card background color" } },
            { name: "cardForeground", type: "text", admin: { description: "Card text color" } },
            { name: "muted", type: "text", admin: { description: "Muted/subtle background" } },
            { name: "mutedForeground", type: "text", admin: { description: "Muted text color" } },
            { name: "accent", type: "text", admin: { description: "Accent color — success states, highlights" } },
            { name: "accentForeground", type: "text", admin: { description: "Text on accent color" } },
            { name: "destructive", type: "text", admin: { description: "Destructive/error color" } },
            { name: "border", type: "text", admin: { description: "Border color" } },
            { name: "ring", type: "text", admin: { description: "Focus ring color" } },
          ],
        },
        {
          name: "typography",
          type: "group",
          admin: { description: "Typography customization" },
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
        {
          name: "style",
          type: "group",
          admin: { description: "Visual style customization" },
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
        {
          name: "theme",
          type: "relationship",
          relationTo: "themes",
          admin: { description: "Optional theme preset (overridden by inline color settings above)" },
        },
      ],
    },

    // ============ CUSTOM CODE ============
    {
      type: "group",
      name: "customCode",
      label: "Custom Code",
      admin: { description: "Custom CSS and HTML injection (scoped to this site)" },
      fields: [
        {
          name: "headHtml",
          type: "textarea",
          admin: { description: "Custom HTML injected into <head> (analytics scripts, meta tags, external fonts)" },
        },
        {
          name: "customCSS",
          type: "textarea",
          admin: {
            description:
              "Custom CSS scoped to this site. Target blocks with [data-block-type='hero']. Dangerous patterns (@import, url(), javascript:) are stripped for security.",
          },
        },
        {
          name: "bodyStartHtml",
          type: "textarea",
          admin: { description: "Custom HTML injected at the start of <body> (tag managers, noscript tags)" },
        },
        {
          name: "bodyEndHtml",
          type: "textarea",
          admin: { description: "Custom HTML injected at the end of <body> (tracking scripts)" },
        },
      ],
    },

    // ============ LAYOUT ============
    {
      name: "defaultLayout",
      type: "relationship",
      relationTo: "layout-templates",
      admin: { description: "Default layout template for all pages on this site" },
    },

    // ============ ACCESS & METADATA ============
    createIsPublicField({ defaultValue: true, description: "Allow public access to this site" }),
    createCreatedByField("User who created this site"),
  ],
};

export default Sites;
