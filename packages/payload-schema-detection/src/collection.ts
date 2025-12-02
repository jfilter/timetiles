/**
 * Schema Detectors Payload Collection.
 *
 * Provides database-driven configuration for schema detectors.
 * Admin users can enable/disable detectors and configure their options.
 *
 * @module
 * @category Collections
 */

import type { CollectionConfig, Field } from "payload";

/**
 * Creates the schema-detectors collection configuration.
 *
 * @param slug - Collection slug (default: 'schema-detectors')
 * @returns Payload collection configuration
 */
export const createSchemaDetectorsCollection = (slug: string = "schema-detectors"): CollectionConfig => ({
  slug,
  labels: {
    singular: "Schema Detector",
    plural: "Schema Detectors",
  },
  admin: {
    group: "System",
    description: "Configure schema detection providers for import workflows",
    defaultColumns: ["label", "name", "enabled", "priority"],
    useAsTitle: "label",
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => user?.role === "admin",
    update: ({ req: { user } }) => user?.role === "admin",
    delete: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Unique identifier for this detector (matches detector.name in code)",
      },
    },
    {
      name: "label",
      type: "text",
      required: true,
      admin: {
        description: "Human-readable name shown in UI",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Description of what this detector handles",
      },
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Whether this detector is available for selection",
      },
    },
    {
      name: "priority",
      type: "number",
      defaultValue: 100,
      min: 1,
      max: 1000,
      admin: {
        description: "Priority for auto-selection (lower = higher priority)",
      },
    },
    {
      name: "options",
      type: "json",
      admin: {
        description: "Detector-specific configuration options (JSON)",
      },
    },
    {
      name: "statistics",
      type: "group",
      label: "Usage Statistics",
      admin: {
        description: "Automatically updated usage statistics",
        readOnly: true,
      },
      fields: [
        {
          name: "totalRuns",
          type: "number",
          defaultValue: 0,
        },
        {
          name: "lastUsed",
          type: "date",
        },
      ],
    },
  ],
});

/**
 * Creates a field to add to the Datasets collection for detector selection.
 *
 * @param collectionSlug - Schema detectors collection slug
 * @returns Payload field configuration
 */
export const createDetectorSelectionField = (collectionSlug: string = "schema-detectors"): Field => ({
  name: "schemaDetector",
  type: "relationship",
  // Use `as never` to work with Payload's strict CollectionSlug type
  // This is safe because the plugin ensures the collection exists
  relationTo: collectionSlug as never,
  hasMany: false,
  admin: {
    description: "Select a schema detector for this dataset (leave empty to use default)",
    position: "sidebar",
  },
});
