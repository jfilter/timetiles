/**
 * Defines the Payload CMS collection configuration for Datasets.
 *
 * A Dataset represents a specific set of data, such as a collection of events from a particular source.
 * This collection is central to the system, defining not only the basic metadata of a dataset
 * but also the rules for how its data should be processed. This includes configurations for:
 * - **ID Strategy:** How to uniquely identify and deduplicate records.
 * - **Schema Management:** Rules for schema detection, validation, and evolution.
 * - **Deduplication:** How to handle duplicate records found during import.
 * - **Type Transformations:** Rules for converting data between different types.
 * - **Geographic Field Detection:** Settings for automatically identifying location data.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { basicMetadataFields, createCommonConfig, createSlugField, metadataField } from "./shared-fields";

const Datasets: CollectionConfig = {
  slug: "datasets",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "catalog", "language", "isPublic"],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    ...basicMetadataFields,
    createSlugField("datasets"),
    {
      name: "catalog",
      type: "relationship",
      relationTo: "catalogs",
      required: true,
      hasMany: false,
    },
    {
      name: "language",
      type: "text",
      required: true,
      maxLength: 3,
      admin: {
        description: "ISO-639 3 letter code (e.g., eng, deu, fra)",
      },
    },
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
      },
    },
    metadataField,
    // ID Strategy Configuration
    {
      name: "idStrategy",
      type: "group",
      admin: {
        condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
      },
      fields: [
        {
          name: "type",
          type: "select",
          options: [
            { label: "Use External ID from Source", value: "external" },
            { label: "Compute Hash from Fields", value: "computed" },
            { label: "Auto-detect Duplicates by Content", value: "auto" },
            { label: "Try External, Fallback to Computed", value: "hybrid" },
          ],
          required: true,
          defaultValue: "external",
          admin: {
            description: "How to generate unique IDs for events",
          },
        },
        {
          name: "externalIdPath",
          type: "text",
          admin: {
            condition: (data) => ["external", "hybrid"].includes(data?.idStrategy?.type),
            description: "JSON path to ID field (e.g., 'id' or 'metadata.uuid')",
          },
        },
        {
          name: "computedIdFields",
          type: "array",
          fields: [
            {
              name: "fieldPath",
              type: "text",
              required: true,
              admin: {
                description: "Path to field to include in hash",
              },
            },
          ],
          admin: {
            condition: (data) => ["computed", "hybrid"].includes(data?.idStrategy?.type),
            description: "Fields to combine for unique hash",
          },
        },
        {
          name: "duplicateStrategy",
          type: "select",
          options: [
            { label: "Skip Duplicates", value: "skip" },
            { label: "Update Existing", value: "update" },
            { label: "Create New Version", value: "version" },
          ],
          defaultValue: "skip",
          admin: {
            description: "What to do when duplicate is found",
          },
        },
      ],
    },
    // Schema Configuration
    {
      name: "schemaConfig",
      type: "group",
      admin: {
        condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
      },
      fields: [
        {
          name: "enabled",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Enable schema detection and validation",
          },
        },
        {
          name: "locked",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Require manual approval for ALL schema changes",
          },
        },
        {
          name: "autoGrow",
          type: "checkbox",
          defaultValue: true,
          admin: {
            description: "Allow automatic schema growth (new optional fields, new enum values)",
          },
        },
        {
          name: "autoApproveNonBreaking",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Automatically approve non-breaking schema changes",
          },
        },
        {
          name: "strictValidation",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Block entire import if any events fail validation",
          },
        },
        {
          name: "allowTransformations",
          type: "checkbox",
          defaultValue: true,
          admin: {
            description: "Allow automatic type transformations during import",
          },
        },
        {
          name: "maxSchemaDepth",
          type: "number",
          defaultValue: 3,
          min: 1,
          max: 10,
          admin: {
            description: "Maximum nesting depth for schema detection",
          },
        },
        {
          name: "enumThreshold",
          type: "number",
          defaultValue: 50,
          admin: {
            description: "Threshold for enum detection",
          },
        },
        {
          name: "enumMode",
          type: "select",
          options: [
            { label: "By Unique Value Count", value: "count" },
            { label: "By Percentage", value: "percentage" },
          ],
          defaultValue: "count",
          admin: {
            description: "How to detect enum fields",
          },
        },
      ],
    },
    // Deduplication Configuration
    {
      name: "deduplicationConfig",
      type: "group",
      admin: {
        condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
      },
      fields: [
        {
          name: "enabled",
          type: "checkbox",
          defaultValue: true,
          admin: {
            description: "Enable duplicate detection during imports",
          },
        },
        {
          name: "strategy",
          type: "select",
          options: [
            { label: "Skip Duplicates", value: "skip" },
            { label: "Update Existing", value: "update" },
            { label: "Create New Version", value: "version" },
          ],
          defaultValue: "skip",
          admin: {
            description: "What to do when duplicate is found",
          },
        },
      ],
    },
    {
      name: "fieldMetadata",
      type: "json",
      admin: {
        readOnly: true,
        description: "Statistics and metadata about each field",
      },
    },
    // Type Transformations
    {
      name: "typeTransformations",
      type: "array",
      dbName: "transforms",
      admin: {
        condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
        description: "Rules for handling type mismatches",
      },
      fields: [
        {
          name: "fieldPath",
          type: "text",
          required: true,
          admin: {
            description: "JSON path to field (e.g., 'temperature' or 'location.altitude')",
          },
        },
        {
          name: "fromType",
          type: "select",
          options: ["string", "number", "boolean", "null", "array", "object"],
          required: true,
        },
        {
          name: "toType",
          type: "select",
          options: ["string", "number", "boolean", "date", "array", "object"],
          required: true,
        },
        {
          name: "transformStrategy",
          type: "select",
          dbName: "strategy",
          options: [
            { label: "Parse (string to number/bool/date)", value: "parse" },
            { label: "Cast (toString, toNumber)", value: "cast" },
            { label: "Custom Function", value: "custom" },
            { label: "Reject", value: "reject" },
          ],
          required: true,
          defaultValue: "parse",
        },
        {
          name: "customTransform",
          type: "code",
          admin: {
            condition: (data) => data?.transformStrategy === "custom",
            language: "javascript",
            description: "Function(value, context) => transformedValue",
          },
        },
        {
          name: "enabled",
          type: "checkbox",
          defaultValue: true,
        },
      ],
    },
    // Enum Detection Configuration
    {
      name: "enumDetection",
      type: "group",
      admin: {
        condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
      },
      fields: [
        {
          name: "mode",
          type: "select",
          options: [
            { label: "By Unique Value Count", value: "count" },
            { label: "By Percentage of Total", value: "percentage" },
            { label: "Disabled", value: "disabled" },
          ],
          defaultValue: "count",
        },
        {
          name: "threshold",
          type: "number",
          defaultValue: 50,
          admin: {
            condition: (data) => data?.enumDetection?.mode !== "disabled",
            description: "Max unique values (count mode) or min percentage (percentage mode)",
          },
        },
      ],
    },
    // Geographic Field Detection (integrates with existing)
    {
      name: "geoFieldDetection",
      type: "group",
      admin: {
        condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
      },
      fields: [
        {
          name: "autoDetect",
          type: "checkbox",
          defaultValue: true,
          admin: {
            description: "Automatically detect latitude/longitude fields",
          },
        },
        {
          name: "latitudePath",
          type: "text",
          admin: {
            description: "Override: JSON path to latitude (detected: location.lat, lat, latitude)",
          },
        },
        {
          name: "longitudePath",
          type: "text",
          admin: {
            description: "Override: JSON path to longitude (detected: location.lng, lng, lon, longitude)",
          },
        },
      ],
    },
  ],
};

export default Datasets;
