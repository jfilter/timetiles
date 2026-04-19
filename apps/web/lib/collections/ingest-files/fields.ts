/**
 * Field definitions for import files collection.
 *
 * @module
 */
import type { Field } from "payload";

import { createQuotaService } from "../../services/quota-service";

export const ingestFileFields: Field[] = [
  // Payload automatically adds filename, mimeType, filesize fields when upload is enabled
  {
    name: "originalName",
    type: "text",
    maxLength: 255,
    admin: {
      description: "Original user-friendly file name",
      readOnly: true, // Set by beforeOperation hook
    },
  },
  {
    name: "catalog",
    type: "relationship",
    relationTo: "catalogs",
    required: false,
    hasMany: false,
    admin: { description: "The catalog this import belongs to (optional)" },
  },
  {
    name: "datasets",
    type: "relationship",
    relationTo: "datasets",
    required: false,
    hasMany: true,
    admin: { description: "Datasets detected in this import (optional)" },
  },
  {
    name: "user",
    type: "relationship",
    relationTo: "users",
    required: true,
    admin: { description: "User who initiated the import" },
  },
  {
    name: "status",
    type: "select",
    options: [
      { label: "Pending", value: "pending" },
      { label: "Parsing", value: "parsing" },
      { label: "Processing", value: "processing" },
      { label: "Completed", value: "completed" },
      { label: "Failed", value: "failed" },
    ],
    defaultValue: "pending",
    admin: { position: "sidebar" },
  },
  {
    name: "datasetsCount",
    type: "number",
    defaultValue: 0,
    admin: { description: "Number of datasets detected in this catalog import" },
  },
  {
    name: "datasetsProcessed",
    type: "number",
    defaultValue: 0,
    admin: { description: "Number of datasets successfully processed" },
  },
  {
    name: "sheetMetadata",
    type: "json",
    admin: { description: "Information about detected sheets/datasets in the file" },
  },
  { name: "jobId", type: "text", admin: { description: "Payload job ID for tracking the catalog parsing job" } },
  { name: "uploadedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" }, position: "sidebar" } },
  {
    name: "completedAt",
    type: "date",
    admin: {
      date: { pickerAppearance: "dayAndTime" },
      position: "sidebar",
      condition: (data) => data.status === "completed",
    },
  },
  {
    name: "errorLog",
    type: "textarea",
    admin: { description: "Detailed error information", condition: (data) => data.status === "failed" },
  },
  { name: "rateLimitInfo", type: "json", admin: { description: "Rate limiting information for this import" } },
  { name: "metadata", type: "json", admin: { description: "Additional import context and metadata" } },
  {
    name: "processingOptions",
    type: "json",
    admin: { description: "Processing options for scheduled ingests (schemaMode, skipDuplicateChecking, etc.)" },
  },
  {
    name: "targetDataset",
    type: "relationship",
    relationTo: "datasets",
    required: false,
    hasMany: false,
    admin: { description: "Target dataset for scheduled ingests" },
  },
  {
    name: "scheduledIngest",
    type: "relationship",
    relationTo: "scheduled-ingests",
    required: false,
    hasMany: false,
    admin: { description: "Reference to the scheduled ingest that triggered this file" },
  },
  {
    name: "quotaInfo",
    type: "json",
    virtual: true,
    admin: { hidden: true },
    hooks: {
      afterRead: [
        async ({ req }) => {
          // Only add quota info for authenticated users
          if (!req.user) return null;

          try {
            const quotaService = createQuotaService(req.payload);

            // Get multiple quota checks for comprehensive info
            const [fileUploads, importJobs, totalEvents] = await Promise.all([
              quotaService.checkQuota(req.user, "FILE_UPLOADS_PER_DAY"),
              quotaService.checkQuota(req.user, "IMPORT_JOBS_PER_DAY"),
              quotaService.checkQuota(req.user, "TOTAL_EVENTS"),
            ]);

            return {
              fileUploads: { current: fileUploads.current, limit: fileUploads.limit, remaining: fileUploads.remaining },
              importJobs: { current: importJobs.current, limit: importJobs.limit, remaining: importJobs.remaining },
              totalEvents: { current: totalEvents.current, limit: totalEvents.limit, remaining: totalEvents.remaining },
              resetTime: fileUploads.resetTime?.toISOString(),
              trustLevel: req.user.trustLevel,
            };
          } catch {
            // Don't fail the request if quota info can't be retrieved
            return null;
          }
        },
      ],
    },
  },
];
