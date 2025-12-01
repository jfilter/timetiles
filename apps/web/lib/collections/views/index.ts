/**
 * Defines the Views collection for configurable UI experiences.
 *
 * A View represents a complete UI configuration including data scope,
 * filter settings, branding, and map defaults. Views enable:
 * - Custom portals with branded experiences
 * - Embedded widgets with subset of data
 * - Different filter configurations per use case
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, createSlugField } from "../shared-fields";
import * as access from "./access";
import { enforceSingleDefault, setCreatedBy } from "./hooks";

const Views: CollectionConfig = {
  slug: "views",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "isDefault", "isPublic", "updatedAt"],
    group: "Configuration",
    description: "Configure UI views with custom data scope, filters, and branding",
  },
  access: {
    read: access.read,
    create: access.create,
    update: access.update,
    delete: access.deleteAccess,
    readVersions: access.readVersions,
  },
  hooks: {
    beforeChange: [setCreatedBy, enforceSingleDefault],
  },
  fields: [
    // ============ IDENTITY ============
    {
      name: "name",
      type: "text",
      required: true,
      maxLength: 255,
      admin: {
        description: "Internal name for this view",
      },
    },
    createSlugField("views"),
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Use as default view when no view specified",
      },
    },

    // ============ DATA SCOPE ============
    {
      type: "group",
      name: "dataScope",
      label: "Data Scope",
      admin: {
        description: "Which data is visible in this view",
      },
      fields: [
        {
          name: "mode",
          type: "select",
          options: [
            { label: "All accessible data", value: "all" },
            { label: "Selected catalogs", value: "catalogs" },
            { label: "Selected datasets", value: "datasets" },
          ],
          defaultValue: "all",
        },
        {
          name: "catalogs",
          type: "relationship",
          relationTo: "catalogs",
          hasMany: true,
          admin: {
            condition: (data) => data?.dataScope?.mode === "catalogs",
            description: "Only show data from these catalogs",
          },
        },
        {
          name: "datasets",
          type: "relationship",
          relationTo: "datasets",
          hasMany: true,
          admin: {
            condition: (data) => data?.dataScope?.mode === "datasets",
            description: "Only show data from these datasets",
          },
        },
      ],
    },

    // ============ FILTER CONFIG ============
    {
      type: "group",
      name: "filterConfig",
      label: "Filter Configuration",
      admin: {
        description: "Configure which fields appear as filters",
      },
      fields: [
        {
          name: "mode",
          type: "select",
          options: [
            { label: "Auto-detect from data", value: "auto" },
            { label: "Manual configuration", value: "manual" },
            { label: "Disabled (no categorical filters)", value: "disabled" },
          ],
          defaultValue: "auto",
        },
        {
          name: "maxFilters",
          type: "number",
          defaultValue: 5,
          min: 1,
          max: 10,
          admin: {
            condition: (data) => data?.filterConfig?.mode !== "disabled",
            description: "Maximum number of filter dropdowns to display",
          },
        },
        {
          name: "fields",
          type: "array",
          label: "Filter Fields",
          admin: {
            condition: (data) => data?.filterConfig?.mode === "manual",
            description: "Configure which fields appear as filters",
          },
          fields: [
            {
              name: "fieldPath",
              type: "text",
              required: true,
              admin: {
                description: "Field path from dataset's fieldMetadata (e.g., 'status', 'category')",
              },
            },
            {
              name: "enabled",
              type: "checkbox",
              defaultValue: true,
              admin: {
                description: "Show this field as a filter",
              },
            },
            {
              name: "label",
              type: "text",
              admin: {
                description: "Custom display label (auto-generated if empty)",
              },
            },
            {
              name: "displayOrder",
              type: "number",
              defaultValue: 0,
              admin: {
                description: "Sort order (lower numbers appear first)",
              },
            },
            {
              name: "maxValues",
              type: "number",
              defaultValue: 15,
              min: 5,
              max: 50,
              admin: {
                description: "Maximum values to show in dropdown",
              },
            },
          ],
        },
        {
          name: "defaultFilters",
          type: "json",
          admin: {
            description: 'Pre-set filter values on load (e.g., {"status": ["active"]})',
          },
        },
      ],
    },

    // ============ BRANDING ============
    {
      type: "group",
      name: "branding",
      label: "Branding",
      admin: {
        description: "Custom branding for this view",
      },
      fields: [
        {
          name: "domain",
          type: "text",
          admin: {
            description: "Custom domain (e.g., events.city.gov)",
          },
        },
        {
          name: "title",
          type: "text",
          admin: {
            description: "Page title (defaults to app name)",
          },
        },
        {
          name: "logo",
          type: "upload",
          relationTo: "media",
          admin: {
            description: "Custom logo image",
          },
        },
        {
          name: "favicon",
          type: "upload",
          relationTo: "media",
          admin: {
            description: "Custom favicon",
          },
        },
        {
          name: "colors",
          type: "group",
          admin: {
            description: "Custom color scheme",
          },
          fields: [
            {
              name: "primary",
              type: "text",
              admin: {
                description: "Primary color (hex, e.g., #3b82f6)",
              },
            },
            {
              name: "secondary",
              type: "text",
              admin: {
                description: "Secondary color (hex)",
              },
            },
            {
              name: "background",
              type: "text",
              admin: {
                description: "Background color (hex)",
              },
            },
          ],
        },
        {
          name: "headerHtml",
          type: "textarea",
          admin: {
            description: "Custom HTML for header (analytics scripts, etc.)",
          },
        },
      ],
    },

    // ============ MAP SETTINGS ============
    {
      type: "group",
      name: "mapSettings",
      label: "Map Settings",
      admin: {
        description: "Default map configuration",
      },
      fields: [
        {
          name: "defaultBounds",
          type: "group",
          admin: {
            description: "Initial map bounds (leave empty for auto-fit to data)",
          },
          fields: [
            {
              name: "north",
              type: "number",
              admin: { description: "North latitude" },
            },
            {
              name: "south",
              type: "number",
              admin: { description: "South latitude" },
            },
            {
              name: "east",
              type: "number",
              admin: { description: "East longitude" },
            },
            {
              name: "west",
              type: "number",
              admin: { description: "West longitude" },
            },
          ],
        },
        {
          name: "defaultZoom",
          type: "number",
          min: 0,
          max: 22,
          admin: {
            description: "Default zoom level (0-22)",
          },
        },
        {
          name: "defaultCenter",
          type: "group",
          admin: {
            description: "Default map center",
          },
          fields: [
            {
              name: "latitude",
              type: "number",
              admin: { description: "Center latitude" },
            },
            {
              name: "longitude",
              type: "number",
              admin: { description: "Center longitude" },
            },
          ],
        },
        {
          name: "baseMapStyle",
          type: "select",
          options: [
            { label: "Default", value: "default" },
            { label: "Light", value: "light" },
            { label: "Dark", value: "dark" },
            { label: "Satellite", value: "satellite" },
          ],
          defaultValue: "default",
          admin: {
            description: "Base map style",
          },
        },
        {
          name: "customStyleUrl",
          type: "text",
          admin: {
            description: "Custom MapLibre style URL (overrides baseMapStyle)",
          },
        },
      ],
    },

    // ============ ACCESS & METADATA ============
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Allow public access to this view",
      },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "User who created this view",
      },
    },
  ],
};

export default Views;
