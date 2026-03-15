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
          admin: { description: "Custom color scheme" },
          fields: [
            { name: "primary", type: "text", admin: { description: "Primary color (hex, e.g., #3b82f6)" } },
            { name: "secondary", type: "text", admin: { description: "Secondary color (hex)" } },
            { name: "background", type: "text", admin: { description: "Background color (hex)" } },
          ],
        },
        {
          name: "headerHtml",
          type: "textarea",
          admin: { description: "Custom HTML for header (analytics scripts, etc.)" },
        },
      ],
    },

    // ============ ACCESS & METADATA ============
    createIsPublicField({ defaultValue: true, description: "Allow public access to this site" }),
    createCreatedByField("User who created this site"),
  ],
};

export default Sites;
