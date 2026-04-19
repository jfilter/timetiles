/**
 * Field definitions for geocoding providers collection.
 *
 * @module
 */
import type { Field } from "payload";

export const geocodingProviderFields: Field[] = [
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
        "Providers in the same group share batch work proportionally to their rate limit. Leave empty for sequential fallback.",
      placeholder: "e.g., photon",
    },
  },

  // ── Generic geographic settings (apply to all provider types) ──
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
    name: "countryCodes",
    type: "text",
    label: "Country Codes",
    admin: {
      description: "Comma-separated ISO 3166-1 alpha-2 codes to restrict/bias results (e.g., 'de,at,ch')",
      placeholder: "e.g., de, at, ch",
    },
  },
  {
    name: "locationBias",
    type: "group",
    label: "Location Bias",
    admin: { description: "Bias results towards a specific location. Supported by Photon and Google Maps." },
    fields: [
      { name: "enabled", type: "checkbox", label: "Enable Location Bias", defaultValue: false },
      {
        name: "lat",
        type: "number",
        label: "Latitude",
        min: -90,
        max: 90,
        admin: { condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true },
      },
      {
        name: "lon",
        type: "number",
        label: "Longitude",
        min: -180,
        max: 180,
        admin: { condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true },
      },
      {
        name: "zoom",
        type: "number",
        label: "Zoom Level",
        min: 1,
        max: 18,
        defaultValue: 10,
        admin: {
          description: "Map zoom level (1=world, 18=building). Controls bias radius. Used by Photon.",
          condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true,
        },
      },
    ],
  },
  {
    name: "boundingBox",
    type: "group",
    label: "Bounding Box",
    admin: { description: "Restrict results to a geographic area. Supported by Photon and OpenCage." },
    fields: [
      { name: "enabled", type: "checkbox", label: "Enable Bounding Box", defaultValue: false },
      {
        name: "minLon",
        type: "number",
        label: "Min Longitude (West)",
        min: -180,
        max: 180,
        admin: { condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true },
      },
      {
        name: "minLat",
        type: "number",
        label: "Min Latitude (South)",
        min: -90,
        max: 90,
        admin: { condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true },
      },
      {
        name: "maxLon",
        type: "number",
        label: "Max Longitude (East)",
        min: -180,
        max: 180,
        admin: { condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true },
      },
      {
        name: "maxLat",
        type: "number",
        label: "Max Latitude (North)",
        min: -90,
        max: 90,
        admin: { condition: (_data, siblingData) => (siblingData as { enabled?: boolean })?.enabled === true },
      },
    ],
  },

  // ── Connection settings ──
  {
    name: "apiKey",
    type: "text",
    label: "API Key",
    access: { read: ({ req: { user } }) => user?.role === "admin" },
    admin: {
      description: "API key for paid providers (Google, OpenCage, LocationIQ)",
      placeholder: "Enter your API key",
      condition: (data) => ["google", "opencage", "locationiq"].includes((data as { type?: string })?.type ?? ""),
    },
  },
  {
    name: "baseUrl",
    type: "text",
    label: "Base URL",
    admin: {
      description: "Server URL (for self-hosted Photon or Nominatim instances)",
      condition: (data) => ["photon", "nominatim"].includes((data as { type?: string })?.type ?? ""),
    },
  },
  {
    name: "userAgent",
    type: "text",
    label: "User Agent",
    defaultValue: "TimeTiles-App/1.0",
    admin: { description: "User agent string sent with requests (required by Nominatim/Photon usage policies)" },
  },
  {
    name: "resultLimit",
    type: "number",
    label: "Result Limit",
    defaultValue: 5,
    min: 1,
    max: 50,
    admin: { description: "Maximum number of results to return per geocode request" },
  },

  // ── Provider-specific settings (only shown when relevant) ──
  {
    name: "config",
    type: "group",
    label: "Advanced Settings",
    admin: {
      description: "Provider-specific options",
      condition: (data) => ["nominatim", "photon"].includes((data as { type?: string })?.type ?? ""),
    },
    fields: [
      {
        name: "nominatim",
        type: "group",
        label: "Nominatim Settings",
        admin: { condition: (data) => (data as { type?: string })?.type === "nominatim" },
        fields: [
          {
            name: "email",
            type: "text",
            label: "Email Contact",
            admin: {
              description: "Contact email for high-volume usage (recommended by Nominatim policy)",
              placeholder: "your-email@domain.com",
            },
          },
        ],
      },
      {
        name: "photon",
        type: "group",
        label: "Photon Settings",
        admin: { condition: (data) => (data as { type?: string })?.type === "photon" },
        fields: [
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
      { name: "failedRequests", type: "number", label: "Failed Requests", defaultValue: 0, admin: { readOnly: true } },
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
];
