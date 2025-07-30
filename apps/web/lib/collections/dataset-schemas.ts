/**
 * @module Defines the Payload CMS collection configuration for Dataset Schemas.
 *
 * This collection is crucial for data governance and quality. It stores versioned schemas
 * for each dataset, allowing for tracking of schema evolution over time. Each document
 * represents a specific version of a dataset's schema, including the schema itself (in JSON Schema format),
 * metadata about fields, and information about the import jobs that contributed to it.
 * This enables features like automated schema validation and detection of breaking changes.
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig, isEditorOrAdmin } from "./shared-fields";

const DatasetSchemas: CollectionConfig = {
  slug: "dataset-schemas",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["displayName", "dataset", "version", "createdAt"],
    description: "Schema versions for datasets with full change tracking",
  },
  access: {
    read: () => true,
    create: () => false, // Auto-generated during imports
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  fields: [
    {
      name: "dataset",
      type: "relationship",
      relationTo: "datasets",
      required: true,
      index: true,
      admin: {
        description: "Dataset this schema belongs to",
      },
    },
    {
      name: "versionNumber",
      type: "number",
      required: true,
      admin: {
        description: "Schema version number (auto-incremented)",
      },
    },
    {
      name: "displayName",
      type: "text",
      admin: {
        hidden: true,
      },
      hooks: {
        beforeChange: [
          ({ data }) => {
            return `v${data?.versionNumber ?? 1} - ${new Date().toISOString().split("T")[0]}`;
          },
        ],
      },
    },
    {
      name: "schema",
      type: "json",
      required: true,
      admin: {
        description: "JSON Schema Draft 7",
      },
    },
    {
      name: "fieldMetadata",
      type: "json",
      required: true,
      admin: {
        description: "Field statistics and metadata",
      },
    },
    {
      name: "schemaSummary",
      type: "group",
      fields: [
        { name: "totalFields", type: "number" },
        {
          name: "newFields",
          type: "array",
          fields: [{ name: "path", type: "text" }],
        },
        {
          name: "removedFields",
          type: "array",
          fields: [{ name: "path", type: "text" }],
        },
        {
          name: "typeChanges",
          type: "array",
          fields: [
            { name: "path", type: "text" },
            { name: "oldType", type: "text" },
            { name: "newType", type: "text" },
          ],
        },
        {
          name: "enumChanges",
          type: "array",
          fields: [
            { name: "path", type: "text" },
            { name: "addedValues", type: "json" },
            { name: "removedValues", type: "json" },
          ],
        },
      ],
    },
    {
      name: "importSources",
      type: "array",
      fields: [
        {
          name: "import",
          type: "relationship",
          relationTo: "import-jobs",
          required: true,
        },
        {
          name: "recordCount",
          type: "number",
        },
        {
          name: "batchCount",
          type: "number",
        },
      ],
      admin: {
        description: "Import jobs that contributed to this schema",
      },
    },
    {
      name: "approvalRequired",
      type: "checkbox",
      admin: {
        description: "Whether this schema requires manual approval",
      },
    },
    {
      name: "approvedBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        condition: (data) => data?.status === "active",
      },
    },
    {
      name: "approvalNotes",
      type: "textarea",
      admin: {
        condition: (data) => Boolean(data?.approvedBy),
      },
    },
    {
      name: "autoApproved",
      type: "checkbox",
      admin: {
        description: "Was automatically approved due to safe changes",
      },
    },
    {
      name: "conflicts",
      type: "json",
      admin: {
        condition: (data) => Boolean(data?.approvalRequired),
        description: "Conflicts that require manual resolution",
      },
    },
  ],
};

export default DatasetSchemas;
