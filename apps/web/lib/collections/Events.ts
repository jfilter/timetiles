import type { CollectionConfig } from "payload";

import { createSlugHook } from "../utils/slug";

const Events: CollectionConfig = {
  slug: "events",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["dataset", "eventTimestamp", "isValid", "createdAt"],
    pagination: {
      defaultLimit: 50,
    },
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: "dataset",
      type: "relationship",
      relationTo: "datasets",
      required: true,
      hasMany: false,
    },
    {
      name: "import",
      type: "relationship",
      relationTo: "imports",
      hasMany: false,
      admin: {
        description: "The import that created this event",
      },
    },
    {
      name: "data",
      type: "json",
      required: true,
      admin: {
        description: "Event data in JSON format",
      },
    },
    {
      name: "location",
      type: "group",
      fields: [
        {
          name: "latitude",
          type: "number",
          admin: {
            step: 0.000001,
          },
        },
        {
          name: "longitude",
          type: "number",
          admin: {
            step: 0.000001,
          },
        },
      ],
      admin: {
        description: "Geographic coordinates (WGS84)",
      },
    },
    {
      name: "coordinateSource",
      type: "group",
      fields: [
        {
          name: "type",
          type: "select",
          options: [
            { label: "Pre-existing in Import", value: "import" },
            { label: "Geocoded from Address", value: "geocoded" },
            { label: "Manual Entry", value: "manual" },
            { label: "Not Available", value: "none" },
          ],
          defaultValue: "none",
        },
        {
          name: "importColumns",
          type: "group",
          fields: [
            {
              name: "latitudeColumn",
              type: "text",
              admin: {
                description: "Column name containing latitude",
              },
            },
            {
              name: "longitudeColumn",
              type: "text",
              admin: {
                description: "Column name containing longitude",
              },
            },
            {
              name: "combinedColumn",
              type: "text",
              admin: {
                description: "Column name if coordinates were combined",
              },
            },
            {
              name: "format",
              type: "text",
              admin: {
                description: "Format of coordinates (decimal, DMS, etc.)",
              },
            },
          ],
          admin: {
            condition: (data) => data.coordinateSource?.type === "import",
          },
        },
        {
          name: "confidence",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            step: 0.01,
            description: "Confidence in coordinate accuracy (0-1)",
          },
        },
        {
          name: "validationStatus",
          type: "select",
          options: [
            { label: "Valid", value: "valid" },
            { label: "Out of Range", value: "out_of_range" },
            { label: "Suspicious (0,0)", value: "suspicious_zero" },
            { label: "Swapped", value: "swapped" },
            { label: "Invalid Format", value: "invalid" },
          ],
        },
      ],
      admin: {
        description: "Source and validation of coordinate data",
      },
    },
    {
      name: "eventTimestamp",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When the actual event occurred",
      },
    },
    {
      name: "isValid",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Whether this event passed validation",
      },
    },
    {
      name: "validationErrors",
      type: "json",
      admin: {
        description: "Validation errors if any",
        condition: (data) => !data.isValid,
      },
    },
    {
      name: "geocodingInfo",
      type: "group",
      fields: [
        {
          name: "originalAddress",
          type: "text",
          admin: {
            description: "Original address string from import",
          },
        },
        {
          name: "provider",
          type: "select",
          options: [
            {
              label: "Google Maps",
              value: "google",
            },
            {
              label: "Nominatim (OpenStreetMap)",
              value: "nominatim",
            },
            {
              label: "Manual Entry",
              value: "manual",
            },
          ],
          admin: {
            description: "Geocoding provider used",
          },
        },
        {
          name: "confidence",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            step: 0.01,
            description: "Geocoding confidence score (0-1)",
          },
        },
        {
          name: "normalizedAddress",
          type: "text",
          admin: {
            description: "Normalized address returned by geocoder",
          },
        },
      ],
      admin: {
        description: "Geocoding metadata and information",
      },
    },
    {
      name: "slug",
      type: "text",
      maxLength: 255,
      unique: true,
      admin: {
        position: "sidebar",
        description:
          "URL-friendly identifier (auto-generated from event title if not provided)",
      },
      hooks: {
        beforeValidate: [
          createSlugHook("events", { sourceField: "data.title" }),
        ],
      },
    },
  ],
  timestamps: true,
  indexes: [
    {
      fields: ["dataset", "eventTimestamp"],
    },
    {
      fields: ["eventTimestamp"],
    },
  ],
};

export default Events;
