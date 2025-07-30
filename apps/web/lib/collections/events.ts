/**
 * @module Defines the Payload CMS collection configuration for Events.
 *
 * The Events collection is the core data storage for all time-based and location-based information.
 * Each document in this collection represents a single event or data point. It is designed to be flexible,
 * storing the original, unprocessed data in a JSON field while also providing structured fields for
 * critical information like location, timestamps, and validation status.
 *
 * Key features of this collection include:
 * - Storing raw data and structured, processed data separately.
 * - Detailed tracking of location data, including its source and confidence.
 * - Information about the geocoding process.
 * - Unique identifiers for deduplication and linking to source data.
 * - Relationships to the parent dataset, import job, and schema version.
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig } from "./shared-fields";

const Events: CollectionConfig = {
  slug: "events",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "id",
    defaultColumns: ["dataset", "eventTimestamp", "createdAt", "validationStatus", "geocodingStatus"],
    pagination: {
      defaultLimit: 50,
    },
    preview: (doc) => {
      // Generate preview URL with authentication
      const params = new URLSearchParams({
        collection: "events",
        slug: String(doc.id),
        secret: process.env.PAYLOAD_PREVIEW_SECRET ?? "",
      });

      return `/api/preview?${params.toString()}`;
    },
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
    readVersions: () => true,
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
      name: "importJob",
      type: "relationship",
      relationTo: "import-jobs",
      hasMany: false,
      admin: {
        description: "The import job that created this event",
      },
    },
    {
      name: "data",
      type: "json",
      required: true,
      admin: {
        description: "Generic data in JSON format",
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
            condition: (data) => (data.coordinateSource as { type?: string })?.type === "import",
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
      name: "validationErrors",
      type: "json",
      admin: {
        description: "Validation errors if any",
        condition: (data) => data?.validationStatus === "invalid" || data?.validationStatus === "transformed",
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
          name: "geocodingStatus",
          type: "select",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Success", value: "success" },
            { label: "Failed", value: "failed" },
          ],
          admin: {
            description: "Geocoding processing status",
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
      name: "uniqueId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "Unique identifier for deduplication (format: datasetId:strategy:value)",
      },
    },
    {
      name: "sourceId",
      type: "text",
      index: true,
      admin: {
        description: "Original ID from source system (when using external ID strategy)",
      },
    },
    {
      name: "contentHash",
      type: "text",
      index: true,
      admin: {
        description: "SHA256 hash of data content for duplicate detection",
      },
    },
    {
      name: "importBatch",
      type: "number",
      index: true,
      admin: {
        description: "Batch number within import for tracking",
      },
    },
    {
      name: "schemaVersionNumber",
      type: "number",
      admin: {
        description: "Schema version number this event was validated against",
      },
    },
    {
      name: "validationStatus",
      type: "select",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Valid", value: "valid" },
        { label: "Invalid", value: "invalid" },
        { label: "Transformed", value: "transformed" },
      ],
      defaultValue: "pending",
      index: true,
    },
    {
      name: "transformations",
      type: "json",
      admin: {
        condition: (data) => data?.validationStatus === "transformed",
        description: "Record of any type transformations applied",
      },
    },
  ],
  indexes: [
    {
      fields: ["dataset", "eventTimestamp"],
    },
    {
      fields: ["eventTimestamp"],
    },
    {
      fields: ["uniqueId"],
    },
    {
      fields: ["dataset", "contentHash"],
    },
    {
      fields: ["importJob", "importBatch"],
    },
    {
      fields: ["validationStatus"],
    },
  ],
};

export default Events;
