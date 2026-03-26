/**
 * Defines the Payload CMS collection configuration for Geocoding Providers.
 *
 * This collection allows administrators to configure and manage multiple external geocoding services
 * (like Google Maps, Nominatim, etc.). It provides a centralized place to store API keys, rate limits,
 * priority, and other provider-specific settings. The system can then use these configurations
 * to dynamically select and use geocoding providers based on priority and availability.
 * It also tracks basic usage statistics for each provider.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig } from "./shared-fields";

export const GeocodingProviders: CollectionConfig = {
  slug: "geocoding-providers",
  ...createCommonConfig(),

  labels: { singular: "Geocoding Provider", plural: "Geocoding Providers" },
  admin: {
    group: "System",
    description: "Manage geocoding provider configurations",
    defaultColumns: ["name", "type", "enabled", "priority", "tags"],
    listSearchableFields: ["name", "type", "tags.value"],
    useAsTitle: "name",
    components: { beforeList: ["/components/admin/geocoding-test-panel"] },
  },
  access: {
    read: ({ req: { user } }) => user?.role === "admin",
    create: ({ req: { user } }) => user?.role === "admin",
    update: ({ req: { user } }) => user?.role === "admin",
    delete: ({ req: { user } }) => user?.role === "admin",
    readVersions: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    {
      name: "name",
      type: "text",
      label: "Provider Name",
      required: true,
      unique: true,
      admin: { description: "Unique name for this provider instance (e.g., 'Google Primary', 'Nominatim EU')" },
    },
    {
      name: "type",
      type: "select",
      label: "Provider Type",
      required: true,
      options: [
        { label: "Google Maps", value: "google" },
        { label: "LocationIQ", value: "locationiq" },
        { label: "Nominatim (OpenStreetMap)", value: "nominatim" },
        { label: "OpenCage", value: "opencage" },
        { label: "Photon (Komoot)", value: "photon" },
      ],
      admin: { description: "The geocoding service provider" },
    },
    {
      name: "enabled",
      type: "checkbox",
      label: "Enabled",
      defaultValue: true,
      admin: { description: "Enable this provider instance" },
    },
    {
      name: "priority",
      type: "number",
      label: "Priority",
      defaultValue: 1,
      min: 1,
      max: 1000,
      required: true,
      admin: { description: "Provider priority (1 = highest priority, 1000 = lowest)" },
    },
    {
      name: "rateLimit",
      type: "number",
      label: "Rate Limit (requests/second)",
      defaultValue: 10,
      min: 1,
      max: 100,
      admin: { description: "Maximum requests per second for this provider" },
    },
    {
      name: "group",
      type: "text",
      label: "Provider Group",
      admin: {
        description:
          "Providers in the same group are queried in parallel (first success wins). Leave empty for sequential fallback.",
        placeholder: "e.g., photon",
      },
    },
    {
      name: "config",
      type: "group",
      label: "Provider Configuration",
      admin: { description: "Provider-specific settings" },
      fields: [
        {
          name: "google",
          type: "group",
          label: "Google Maps Settings",
          admin: { condition: (data) => (data as { type?: string })?.type === "google" },
          fields: [
            {
              name: "apiKey",
              type: "text",
              label: "API Key",
              required: true,
              access: { read: ({ req: { user } }) => user?.role === "admin" },
              admin: { description: "Google Maps Geocoding API key", placeholder: "Enter your Google Maps API key" },
            },
            {
              name: "region",
              type: "text",
              label: "Region Bias",
              admin: {
                description: "ISO 3166-1 alpha-2 country code for result bias (e.g., 'US', 'GB')",
                placeholder: "e.g., US, GB, DE",
              },
            },
            {
              name: "language",
              type: "text",
              label: "Language",
              defaultValue: "en",
              admin: { description: "Language for returned results (e.g., 'en', 'de', 'fr')" },
            },
          ],
        },
        {
          name: "nominatim",
          type: "group",
          label: "Nominatim Settings",
          admin: { condition: (data) => (data as { type?: string })?.type === "nominatim" },
          fields: [
            {
              name: "baseUrl",
              type: "text",
              label: "Base URL",
              defaultValue: "https://nominatim.openstreetmap.org",
              required: true,
              admin: { description: "Nominatim server URL" },
            },
            {
              name: "userAgent",
              type: "text",
              label: "User Agent",
              defaultValue: "TimeTiles-App/1.0",
              required: true,
              admin: { description: "User agent string for requests (required by Nominatim policy)" },
            },
            {
              name: "email",
              type: "text",
              label: "Email Contact",
              admin: {
                description: "Contact email for high-volume usage (recommended)",
                placeholder: "your-email@domain.com",
              },
            },
            {
              name: "countrycodes",
              type: "text",
              label: "Country Codes",
              admin: {
                description: "Comma-separated ISO 3166-1 alpha-2 codes to limit results (e.g., 'us,ca,gb')",
                placeholder: "us,ca,gb",
              },
            },
            {
              name: "addressdetails",
              type: "checkbox",
              label: "Include Address Details",
              defaultValue: true,
              admin: { description: "Include detailed address components in results" },
            },
            {
              name: "extratags",
              type: "checkbox",
              label: "Include Extra Tags",
              defaultValue: false,
              admin: { description: "Include additional OSM tags in results" },
            },
          ],
        },
        {
          name: "opencage",
          type: "group",
          label: "OpenCage Settings",
          admin: { condition: (data) => (data as { type?: string })?.type === "opencage" },
          fields: [
            {
              name: "apiKey",
              type: "text",
              label: "API Key",
              required: true,
              access: { read: ({ req: { user } }) => user?.role === "admin" },
              admin: { description: "OpenCage Geocoding API key", placeholder: "Enter your OpenCage API key" },
            },
            {
              name: "language",
              type: "text",
              label: "Language Code",
              defaultValue: "en",
              admin: { description: "ISO 639-1 language code for results (e.g., 'en', 'de', 'fr')" },
            },
            {
              name: "countrycode",
              type: "text",
              label: "Country Code",
              admin: {
                description: "ISO 3166-1 alpha-2 country code to restrict results (e.g., 'US', 'DE')",
                placeholder: "e.g., US, GB, DE",
              },
            },
            {
              name: "bounds",
              type: "group",
              label: "Geographic Bounds",
              admin: { description: "Restrict results to a specific geographic area" },
              fields: [
                { name: "enabled", type: "checkbox", label: "Enable Bounds Restriction", defaultValue: false },
                {
                  name: "southwest",
                  type: "group",
                  label: "Southwest Corner",
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                  fields: [
                    { name: "lat", type: "number", label: "Latitude", min: -90, max: 90 },
                    { name: "lng", type: "number", label: "Longitude", min: -180, max: 180 },
                  ],
                },
                {
                  name: "northeast",
                  type: "group",
                  label: "Northeast Corner",
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                  fields: [
                    { name: "lat", type: "number", label: "Latitude", min: -90, max: 90 },
                    { name: "lng", type: "number", label: "Longitude", min: -180, max: 180 },
                  ],
                },
              ],
            },
            {
              name: "annotations",
              type: "checkbox",
              label: "Include Annotations",
              defaultValue: true,
              admin: { description: "Include additional metadata like timezone, currency, etc." },
            },
            {
              name: "abbrv",
              type: "checkbox",
              label: "Abbreviate Results",
              defaultValue: false,
              admin: { description: "Abbreviate street names and components" },
            },
          ],
        },
        {
          name: "locationiq",
          type: "group",
          label: "LocationIQ Settings",
          admin: { condition: (data) => (data as { type?: string })?.type === "locationiq" },
          fields: [
            {
              name: "apiKey",
              type: "text",
              label: "API Key",
              required: true,
              access: { read: ({ req: { user } }) => user?.role === "admin" },
              admin: { description: "LocationIQ API key", placeholder: "Enter your LocationIQ API key" },
            },
            {
              name: "countrycodes",
              type: "text",
              label: "Country Codes",
              admin: {
                description: "Comma-separated ISO 3166-1 alpha-2 codes to limit results (e.g., 'us,ca,gb')",
                placeholder: "us,ca,gb",
              },
            },
          ],
        },
        {
          name: "photon",
          type: "group",
          label: "Photon (Komoot) Settings",
          admin: { condition: (data) => (data as { type?: string })?.type === "photon" },
          fields: [
            {
              name: "baseUrl",
              type: "text",
              label: "Base URL",
              defaultValue: "https://photon.komoot.io",
              required: true,
              admin: { description: "Photon server URL (default: public Komoot instance)" },
            },
            {
              name: "language",
              type: "text",
              label: "Language",
              admin: {
                description: "ISO 639-1 language code for results (e.g., 'en', 'de', 'fr')",
                placeholder: "e.g., en, de, fr",
              },
            },
            {
              name: "limit",
              type: "number",
              label: "Result Limit",
              defaultValue: 5,
              min: 1,
              max: 50,
              admin: { description: "Maximum number of results to return" },
            },
            {
              name: "locationBias",
              type: "group",
              label: "Location Bias",
              admin: { description: "Bias results towards a specific location" },
              fields: [
                { name: "enabled", type: "checkbox", label: "Enable Location Bias", defaultValue: false },
                {
                  name: "lat",
                  type: "number",
                  label: "Latitude",
                  min: -90,
                  max: 90,
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                },
                {
                  name: "lon",
                  type: "number",
                  label: "Longitude",
                  min: -180,
                  max: 180,
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                },
                {
                  name: "zoom",
                  type: "number",
                  label: "Zoom Level",
                  min: 1,
                  max: 18,
                  defaultValue: 10,
                  admin: {
                    description: "Map zoom level (1=world, 18=building). Controls bias radius.",
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                },
              ],
            },
            {
              name: "bbox",
              type: "group",
              label: "Bounding Box Filter",
              admin: { description: "Restrict results to a geographic area" },
              fields: [
                { name: "enabled", type: "checkbox", label: "Enable Bounding Box", defaultValue: false },
                {
                  name: "minLon",
                  type: "number",
                  label: "Min Longitude",
                  min: -180,
                  max: 180,
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                },
                {
                  name: "minLat",
                  type: "number",
                  label: "Min Latitude",
                  min: -90,
                  max: 90,
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                },
                {
                  name: "maxLon",
                  type: "number",
                  label: "Max Longitude",
                  min: -180,
                  max: 180,
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                },
                {
                  name: "maxLat",
                  type: "number",
                  label: "Max Latitude",
                  min: -90,
                  max: 90,
                  admin: {
                    condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
                  },
                },
              ],
            },
            {
              name: "osmTag",
              type: "text",
              label: "OSM Tag Filter",
              admin: {
                description:
                  "Filter by OSM tag (e.g., 'place:city', '!highway', ':!construction'). See Photon docs for syntax.",
                placeholder: "e.g., place:city",
              },
            },
            {
              name: "layer",
              type: "select",
              label: "Layer Filter",
              hasMany: true,
              options: [
                { label: "House", value: "house" },
                { label: "Street", value: "street" },
                { label: "Locality", value: "locality" },
                { label: "District", value: "district" },
                { label: "City", value: "city" },
                { label: "County", value: "county" },
                { label: "State", value: "state" },
                { label: "Country", value: "country" },
              ],
              admin: { description: "Restrict results to specific geographic layers", isClearable: true },
            },
          ],
        },
      ],
    },
    {
      name: "tags",
      type: "select",
      hasMany: true,
      label: "Tags",
      options: [
        { label: "Production", value: "production" },
        { label: "Development", value: "development" },
        { label: "Testing", value: "testing" },
        { label: "Backup", value: "backup" },
        { label: "Primary", value: "primary" },
        { label: "Secondary", value: "secondary" },
        { label: "Region: US", value: "region-us" },
        { label: "Region: EU", value: "region-eu" },
        { label: "Region: Asia", value: "region-asia" },
        { label: "Region: Global", value: "region-global" },
        { label: "High Volume", value: "high-volume" },
        { label: "Low Volume", value: "low-volume" },
        { label: "Free Tier", value: "free-tier" },
        { label: "Paid Tier", value: "paid-tier" },
      ],
      admin: { description: "Tags for organizing and filtering providers", isClearable: true },
    },
    {
      name: "statistics",
      type: "group",
      label: "Usage Statistics",
      admin: { description: "Provider usage statistics (automatically updated)" },
      fields: [
        { name: "totalRequests", type: "number", label: "Total Requests", defaultValue: 0, admin: { readOnly: true } },
        {
          name: "successfulRequests",
          type: "number",
          label: "Successful Requests",
          defaultValue: 0,
          admin: { readOnly: true },
        },
        {
          name: "failedRequests",
          type: "number",
          label: "Failed Requests",
          defaultValue: 0,
          admin: { readOnly: true },
        },
        {
          name: "lastUsed",
          type: "date",
          label: "Last Used",
          admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
        },
        { name: "averageResponseTime", type: "number", label: "Average Response Time (ms)", admin: { readOnly: true } },
      ],
    },
    {
      name: "notes",
      type: "textarea",
      label: "Notes",
      admin: { description: "Internal notes about this provider instance", rows: 3 },
    },
  ],
};

export default GeocodingProviders;
