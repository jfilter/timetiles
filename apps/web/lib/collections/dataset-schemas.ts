/**
 * Defines the Payload CMS collection configuration for Dataset Schemas.
 *
 * This collection is crucial for data governance and quality. It stores versioned schemas
 * for each dataset, allowing for tracking of schema evolution over time. Each document
 * represents a specific version of a dataset's schema, including the schema itself (in JSON Schema format),
 * metadata about fields, and information about the import jobs that contributed to it.
 * This enables features like automated schema validation and detection of breaking changes.
 *
 * @module
 */
import type { Access, CollectionConfig, Where } from "payload";

import { extractRelationId } from "@/lib/utils/relation-id";

import { createCommonConfig, isEditorOrAdmin, isPrivileged } from "./shared-fields";

const DatasetSchemas: CollectionConfig = {
  slug: "dataset-schemas",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["displayName", "dataset", "version", "createdAt"],
    description: "Schema versions for datasets with full change tracking",
    group: "Data",
  },
  access: {
    // Schema access uses denormalized fields for zero-query access control
    // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
    read: (({ req: { user } }): boolean | Where => {
      if (isPrivileged(user)) return true;

      if (user) {
        return { or: [{ datasetIsPublic: { equals: true } }, { catalogOwnerId: { equals: user.id } }] } as Where;
      }

      return { datasetIsPublic: { equals: true } };
    }) as Access,

    // Auto-generated during imports - no manual creation
    create: () => false,

    // Only editors and admins can manually update schemas
    update: isEditorOrAdmin,

    // Only editors and admins can delete schemas
    delete: isEditorOrAdmin,

    // Only admins can read version history
    readVersions: ({ req: { user } }) => user?.role === "admin",
  },
  fields: [
    {
      name: "dataset",
      type: "relationship",
      relationTo: "datasets",
      required: true,
      index: true,
      admin: { description: "Dataset this schema belongs to" },
    },
    {
      name: "datasetIsPublic",
      type: "checkbox",
      defaultValue: false,
      index: true,
      admin: {
        hidden: true,
        description: "Denormalized: dataset.isPublic AND catalog.isPublic for zero-query access control",
      },
    },
    {
      name: "catalogOwnerId",
      type: "number",
      index: true,
      admin: { hidden: true, description: "Denormalized: catalog.createdBy for zero-query owner access control" },
    },
    {
      name: "versionNumber",
      type: "number",
      required: true,
      admin: { description: "Schema version number (auto-incremented)" },
    },
    {
      name: "displayName",
      type: "text",
      admin: { hidden: true },
      hooks: {
        beforeChange: [
          ({ data }) => {
            return `v${data?.versionNumber ?? 1} - ${new Date().toISOString().split("T")[0]}`;
          },
        ],
      },
    },
    { name: "schema", type: "json", required: true, admin: { description: "JSON Schema Draft 7" } },
    { name: "fieldMetadata", type: "json", required: true, admin: { description: "Field statistics and metadata" } },
    {
      name: "eventCountAtCreation",
      type: "number",
      admin: { description: "Number of events in the dataset when this schema was generated" },
    },
    {
      name: "schemaSummary",
      type: "group",
      fields: [
        { name: "totalFields", type: "number" },
        { name: "newFields", type: "array", fields: [{ name: "path", type: "text" }] },
        { name: "removedFields", type: "array", fields: [{ name: "path", type: "text" }] },
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
      name: "ingestSources",
      type: "array",
      fields: [
        { name: "ingestJob", type: "relationship", relationTo: "ingest-jobs", required: true },
        { name: "recordCount", type: "number" },
        { name: "batchCount", type: "number" },
      ],
      admin: { description: "Ingest jobs that contributed to this schema" },
    },
    {
      name: "approvalRequired",
      type: "checkbox",
      admin: { description: "Whether this schema requires manual approval" },
    },
    {
      name: "approvedBy",
      type: "relationship",
      relationTo: "users",
      admin: { condition: (data) => data?.status === "active" },
    },
    { name: "approvalNotes", type: "textarea", admin: { condition: (data) => Boolean(data?.approvedBy) } },
    {
      name: "autoApproved",
      type: "checkbox",
      admin: { description: "Was automatically approved due to safe changes" },
    },
    {
      name: "conflicts",
      type: "json",
      admin: {
        condition: (data) => Boolean(data?.approvalRequired),
        description: "Conflicts that require manual resolution",
      },
    },
    {
      name: "fieldMappings",
      type: "group",
      label: "Field Mappings",
      admin: { description: "Detected or configured field mappings for standard event properties" },
      fields: [
        {
          name: "titlePath",
          type: "text",
          admin: { description: "Path to title/name field in source data", readOnly: true },
        },
        {
          name: "descriptionPath",
          type: "text",
          admin: { description: "Path to description/details field in source data", readOnly: true },
        },
        {
          name: "locationNamePath",
          type: "text",
          admin: { description: "Path to location/venue name field in source data", readOnly: true },
        },
        {
          name: "timestampPath",
          type: "text",
          admin: { description: "Path to timestamp/date field in source data", readOnly: true },
        },
        {
          name: "endTimestampPath",
          type: "text",
          admin: { description: "Path to end timestamp/date field in source data", readOnly: true },
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== "create" || !data?.dataset) return data;

        const datasetId = extractRelationId(data.dataset);
        if (!datasetId) return data;

        const dataset = await req.payload.findByID({
          collection: "datasets",
          id: datasetId,
          depth: 1,
          overrideAccess: true,
          req,
        });

        if (!dataset) return data;

        const catalog = typeof dataset.catalog === "object" ? dataset.catalog : null;
        const accessFields = {
          datasetIsPublic: (dataset.isPublic ?? false) && (catalog?.isPublic ?? false),
          catalogOwnerId: catalog?.createdBy ? extractRelationId(catalog.createdBy) : undefined,
        };
        Object.assign(data, accessFields);

        return data;
      },
    ],
  },
};

export default DatasetSchemas;
