/**
 * Defines the Payload CMS collection configuration for the Location Cache.
 *
 * This collection serves as a cache for geocoding results to reduce redundant API calls
 * to external services and improve performance. When an address is successfully geocoded,
 * the result is stored here.
 *
 * Before attempting to geocode a new address, the system first checks this collection
 * for a matching entry. This collection stores the original address, the resulting coordinates,
 * the provider that supplied the data, and other useful metadata like usage statistics.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, isEditorOrAdmin } from "./shared-fields";

const LocationCache: CollectionConfig = {
  slug: "location-cache",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "originalAddress",
    defaultColumns: ["originalAddress", "provider", "confidence", "hitCount", "lastUsed"],
    pagination: {
      defaultLimit: 50,
    },
  },
  access: {
    read: () => true,
    create: () => false,
    update: () => false,
    delete: isEditorOrAdmin,
  },
  fields: [
    {
      name: "originalAddress",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "Original address string",
      },
    },
    {
      name: "normalizedAddress",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "Normalized address for better matching",
      },
    },
    {
      name: "latitude",
      type: "number",
      required: true,
      admin: {
        step: 0.000001,
        description: "Latitude coordinate (WGS84)",
      },
    },
    {
      name: "longitude",
      type: "number",
      required: true,
      admin: {
        step: 0.000001,
        description: "Longitude coordinate (WGS84)",
      },
    },
    {
      name: "provider",
      type: "text",
      required: true,
      admin: {
        description: "Name of the geocoding provider used",
      },
    },
    {
      name: "confidence",
      type: "number",
      min: 0,
      max: 1,
      admin: {
        step: 0.01,
        description: "Confidence score (0-1)",
      },
    },
    {
      name: "hitCount",
      type: "number",
      defaultValue: 1,
      admin: {
        description: "Number of times this cached result was used",
      },
    },
    {
      name: "lastUsed",
      type: "date",
      defaultValue: () => new Date(),
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "Last time this cached result was accessed",
      },
    },
    {
      name: "components",
      type: "group",
      fields: [
        {
          name: "streetNumber",
          type: "text",
          admin: {
            description: "Street number",
          },
        },
        {
          name: "streetName",
          type: "text",
          admin: {
            description: "Street name",
          },
        },
        {
          name: "city",
          type: "text",
          admin: {
            description: "City name",
          },
        },
        {
          name: "region",
          type: "text",
          admin: {
            description: "State/Region/Province",
          },
        },
        {
          name: "postalCode",
          type: "text",
          admin: {
            description: "Postal/ZIP code",
          },
        },
        {
          name: "country",
          type: "text",
          admin: {
            description: "Country name",
          },
        },
      ],
      admin: {
        description: "Parsed address components",
      },
    },
    {
      name: "metadata",
      type: "json",
      admin: {
        description: "Additional provider-specific metadata",
      },
    },
  ],
};

export default LocationCache;
