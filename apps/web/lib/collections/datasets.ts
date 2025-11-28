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

import * as access from "./datasets/access";
import { syncIsPublicToEvents, validatePublicCatalogDataset } from "./datasets/hooks";
import { transformationFields } from "./datasets/transformation-fields";
import { basicMetadataFields, createCommonConfig, createSlugField, metadataField } from "./shared-fields";

const Datasets: CollectionConfig = {
  slug: "datasets",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "catalog", "language", "isPublic"],
    group: "Data",
  },
  access: {
    read: access.read,
    create: access.create,
    update: access.update,
    delete: access.deleteAccess,
    readVersions: access.readVersions,
  },
  hooks: {
    beforeChange: [validatePublicCatalogDataset],
    afterChange: [syncIsPublicToEvents],
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
      name: "catalogCreatorId",
      type: "number",
      index: true,
      admin: {
        hidden: true,
        description: "Denormalized from catalog.createdBy for zero-query owner access control",
      },
    },
    {
      name: "catalogIsPublic",
      type: "checkbox",
      defaultValue: false,
      index: true,
      admin: {
        hidden: true,
        description: "Denormalized from catalog.isPublic for zero-query access control",
      },
    },
    {
      name: "language",
      type: "text",
      required: true,
      maxLength: 3,
      minLength: 3,
      validate: (value: string | null | undefined): string | true => {
        if (!value) return "Language code is required";
        if (value.length !== 3) return "Language code must be exactly 3 characters (ISO 639-3)";
        if (!/^[a-z]{3}$/.test(value)) return "Language code must be 3 lowercase letters (e.g., eng, deu, fra)";
        return true;
      },
      admin: {
        description: "ISO-639-3 code: 3 lowercase letters (e.g., eng, deu, fra)",
      },
    },
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        components: {
          afterInput: ["/components/admin/private-visibility-notice"],
        },
      },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      hasMany: false,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "User who created this dataset",
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
          defaultValue: "auto",
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
    // Type Transformations and Import Transforms (extracted to separate file)
    ...transformationFields,
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
    // Field Mapping Overrides (Language-aware field detection)
    {
      name: "fieldMappingOverrides",
      type: "group",
      label: "Field Mapping Overrides",
      admin: {
        condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
        description:
          "Override language-aware auto-detection of field mappings. Leave empty to use automatic detection based on dataset language.",
      },
      fields: [
        {
          name: "titlePath",
          type: "text",
          admin: {
            description: "Override detected title field (e.g., 'event_name', 'titel', 'titre')",
          },
        },
        {
          name: "descriptionPath",
          type: "text",
          admin: {
            description: "Override detected description field (e.g., 'details', 'beschreibung', 'détails')",
          },
        },
        {
          name: "locationNamePath",
          type: "text",
          admin: {
            description: "Override detected location name field (e.g., 'venue', 'place', 'ort', 'lieu')",
          },
        },
        {
          name: "timestampPath",
          type: "text",
          admin: {
            description: "Override detected timestamp field (e.g., 'created_at', 'datum', 'date')",
          },
        },
        {
          name: "latitudePath",
          type: "text",
          admin: {
            description: "Override detected latitude field (e.g., 'lat', 'latitude', 'y_coord')",
          },
        },
        {
          name: "longitudePath",
          type: "text",
          admin: {
            description: "Override detected longitude field (e.g., 'lon', 'longitude', 'x_coord')",
          },
        },
        {
          name: "locationPath",
          type: "text",
          admin: {
            description: "Override detected location field (e.g., 'address', 'location', 'venue', 'city')",
          },
        },
      ],
    },
  ],
};

export default Datasets;
