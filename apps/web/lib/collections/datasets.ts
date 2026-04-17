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

import { create, deleteAccess, read, readVersions, update } from "./datasets/access";
import {
  handleDatasetUniqueConstraintError,
  syncIsPublicToEvents,
  validateDatasetNameUniqueness,
  validatePublicCatalogDataset,
} from "./datasets/hooks";
import { transformationFields } from "./datasets/transformation-fields";
import {
  basicMetadataFields,
  createCommonConfig,
  createCreatedByField,
  createIsPublicField,
  createSlugField,
  editorOrAdminCondition,
  metadataField,
} from "./shared-fields";

const Datasets: CollectionConfig = {
  slug: "datasets",
  ...createCommonConfig(),
  admin: { useAsTitle: "name", defaultColumns: ["name", "catalog", "language", "isPublic"], group: "Data" },
  access: { read, create, update, delete: deleteAccess, readVersions },
  hooks: {
    beforeChange: [validateDatasetNameUniqueness, validatePublicCatalogDataset],
    afterChange: [syncIsPublicToEvents],
    // Translates the DB-level unique violation (from the catalog+name index)
    // into the same user-friendly message thrown by validateDatasetNameUniqueness
    // when a TOCTOU race slips past the optimistic find-first check.
    afterError: [handleDatasetUniqueConstraintError],
  },
  fields: [
    ...basicMetadataFields,
    createSlugField("datasets"),
    { name: "catalog", type: "relationship", relationTo: "catalogs", required: true, hasMany: false },
    {
      name: "catalogCreatorId",
      type: "number",
      index: true,
      admin: { hidden: true, description: "Denormalized from catalog.createdBy for zero-query owner access control" },
    },
    {
      name: "catalogIsPublic",
      type: "checkbox",
      defaultValue: false,
      index: true,
      admin: { hidden: true, description: "Denormalized from catalog.isPublic for zero-query access control" },
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
      admin: { description: "ISO-639-3 code: 3 lowercase letters (e.g., eng, deu, fra)" },
    },
    createIsPublicField({ showPrivateNotice: true }),
    createCreatedByField("User who created this dataset"),
    {
      name: "license",
      type: "text",
      maxLength: 255,
      admin: { description: "Override catalog-level license if this dataset has a different license" },
    },
    {
      name: "sourceUrl",
      type: "text",
      maxLength: 2048,
      admin: { description: "Override catalog-level source URL if this dataset has a different source" },
    },
    {
      name: "publisher",
      type: "group",
      admin: { description: "Override catalog-level publisher if this dataset has a different source" },
      fields: [
        { name: "name", type: "text", maxLength: 255 },
        { name: "url", type: "text", maxLength: 2048 },
        { name: "acronym", type: "text", maxLength: 50 },
        { name: "description", type: "textarea" },
        { name: "country", type: "text", maxLength: 2 },
        { name: "official", type: "checkbox", defaultValue: false },
      ],
    },
    {
      name: "coverage",
      type: "group",
      admin: { description: "Override catalog-level coverage" },
      fields: [
        { name: "countries", type: "array", fields: [{ name: "code", type: "text", required: true, maxLength: 2 }] },
        { name: "start", type: "text", maxLength: 10 },
      ],
    },
    metadataField,
    // ID Strategy Configuration
    {
      name: "idStrategy",
      type: "group",
      admin: { condition: editorOrAdminCondition },
      fields: [
        {
          name: "type",
          type: "select",
          options: [
            { label: "Use External ID from Source", value: "external" },
            { label: "Content Hash (detect duplicates by content)", value: "content-hash" },
            { label: "Auto-generate (no duplicate detection)", value: "auto-generate" },
          ],
          required: true,
          defaultValue: "content-hash",
          admin: { description: "How to generate unique IDs for events" },
        },
        {
          name: "externalIdPath",
          type: "text",
          admin: {
            condition: (data) => data?.idStrategy?.type === "external",
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
              admin: { description: "Path to field to include in hash" },
            },
          ],
          admin: {
            condition: () => false,
            description: "Deprecated: kept for backward compatibility with existing data",
          },
        },
        {
          name: "excludeFields",
          type: "array",
          fields: [
            {
              name: "fieldPath",
              type: "text",
              required: true,
              admin: { description: "Path to field to exclude from content hash" },
            },
          ],
          admin: {
            condition: (data) => data?.idStrategy?.type === "content-hash",
            description: "Fields to exclude from the content hash (e.g., volatile timestamps)",
          },
        },
        {
          name: "duplicateStrategy",
          type: "select",
          options: [
            { label: "Skip Duplicates", value: "skip" },
            { label: "Update Existing", value: "update" },
          ],
          defaultValue: "skip",
          admin: { description: "What to do when duplicate is found" },
        },
      ],
    },
    // Schema Configuration
    {
      name: "schemaConfig",
      type: "group",
      admin: { condition: editorOrAdminCondition },
      fields: [
        {
          name: "locked",
          type: "checkbox",
          defaultValue: false,
          admin: { description: "Require manual approval for ALL schema changes" },
        },
        {
          name: "autoGrow",
          type: "checkbox",
          defaultValue: true,
          admin: { description: "Allow automatic schema growth (new optional fields, new enum values)" },
        },
        {
          name: "autoApproveNonBreaking",
          type: "checkbox",
          defaultValue: false,
          admin: { description: "Automatically approve non-breaking schema changes" },
        },
        {
          name: "maxSchemaDepth",
          type: "number",
          defaultValue: 3,
          min: 1,
          max: 10,
          admin: { description: "Maximum nesting depth for schema detection" },
        },
        {
          name: "enumThreshold",
          type: "number",
          defaultValue: 50,
          admin: { description: "Threshold for enum detection" },
        },
        {
          name: "enumMode",
          type: "select",
          options: [
            { label: "By Unique Value Count", value: "count" },
            { label: "By Percentage", value: "percentage" },
          ],
          defaultValue: "count",
          admin: { description: "How to detect enum fields" },
        },
      ],
    },
    // Deduplication Configuration
    {
      name: "deduplicationConfig",
      type: "group",
      admin: { condition: (data) => editorOrAdminCondition(data) && data?.idStrategy?.type !== "auto-generate" },
      fields: [
        {
          name: "enabled",
          type: "checkbox",
          defaultValue: true,
          admin: { description: "Enable duplicate detection during imports" },
        },
      ],
    },
    {
      name: "fieldMetadata",
      type: "json",
      admin: { readOnly: true, description: "Statistics and metadata about each field" },
    },
    {
      name: "fieldTypes",
      type: "json",
      admin: {
        readOnly: true,
        description:
          "Field type groups from schema detection: { tags: [...], enum: [...], date: [...], url: [...], number: [...] }",
      },
    },
    // Type Transformations and Import Transforms (extracted to separate file)
    ...transformationFields,
    // Geographic Field Detection (integrates with existing)
    {
      name: "geoFieldDetection",
      type: "group",
      admin: { condition: editorOrAdminCondition },
      fields: [
        {
          name: "autoDetect",
          type: "checkbox",
          defaultValue: true,
          admin: { description: "Automatically detect latitude/longitude fields" },
        },
        {
          name: "latitudePath",
          type: "text",
          admin: { description: "Override: JSON path to latitude (detected: location.lat, lat, latitude)" },
        },
        {
          name: "longitudePath",
          type: "text",
          admin: { description: "Override: JSON path to longitude (detected: location.lng, lng, lon, longitude)" },
        },
      ],
    },
    // Field Mapping Overrides (Language-aware field detection)
    {
      name: "fieldMappingOverrides",
      type: "group",
      label: "Field Mapping Overrides",
      admin: {
        condition: editorOrAdminCondition,
        description:
          "Override language-aware auto-detection of field mappings. Leave empty to use automatic detection based on dataset language.",
      },
      fields: [
        {
          name: "titlePath",
          type: "text",
          admin: { description: "Override detected title field (e.g., 'event_name', 'titel', 'titre')" },
        },
        {
          name: "descriptionPath",
          type: "text",
          admin: { description: "Override detected description field (e.g., 'details', 'beschreibung', 'détails')" },
        },
        {
          name: "locationNamePath",
          type: "text",
          admin: { description: "Override detected location name field (e.g., 'venue', 'place', 'ort', 'lieu')" },
        },
        {
          name: "timestampPath",
          type: "text",
          admin: { description: "Override detected timestamp field (e.g., 'created_at', 'datum', 'date')" },
        },
        {
          name: "endTimestampPath",
          type: "text",
          admin: { description: "Override detected end timestamp field (e.g., 'end_date', 'enddatum', 'date_fin')" },
        },
        {
          name: "latitudePath",
          type: "text",
          admin: { description: "Override detected latitude field (e.g., 'lat', 'latitude', 'y_coord')" },
        },
        {
          name: "longitudePath",
          type: "text",
          admin: { description: "Override detected longitude field (e.g., 'lon', 'longitude', 'x_coord')" },
        },
        {
          name: "locationPath",
          type: "text",
          admin: { description: "Override detected location field (e.g., 'address', 'location', 'venue', 'city')" },
        },
      ],
    },
    {
      name: "hasTemporalData",
      type: "checkbox",
      defaultValue: true,
      admin: {
        readOnly: true,
        description: "Whether this dataset contains events with timestamps. Auto-set during import.",
      },
    },
  ],
};

export default Datasets;
