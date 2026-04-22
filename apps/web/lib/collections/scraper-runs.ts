/**
 * Defines the Payload CMS collection for scraper execution history.
 *
 * Each run records the outcome of executing a single scraper: status, logs,
 * duration, output metrics, and an optional link to the resulting import-file.
 * See ADR 0015 for full architecture.
 *
 * @category Collections
 * @module
 */
import type { CollectionConfig, Where } from "payload";

import { isEditorOrAdmin, isPrivileged } from "./shared-fields";

const ScraperRuns: CollectionConfig = {
  slug: "scraper-runs",
  timestamps: true,
  trash: false,
  admin: {
    useAsTitle: "id",
    defaultColumns: ["scraper", "status", "triggeredBy", "durationMs", "createdAt"],
    group: "Scrapers",
  },
  access: {
    // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
    read: ({ req: { user } }): boolean | Where => {
      if (isPrivileged(user)) return true;
      if (!user) return false;
      return { scraperOwner: { equals: user.id } };
    },
    // Runs are created by the system (jobs), not directly by users
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  fields: [
    // Relationships
    { name: "scraper", type: "relationship", relationTo: "scrapers", required: true, index: true },
    // Denormalized owner for zero-query access control
    {
      name: "scraperOwner",
      type: "number",
      index: true,
      admin: { hidden: true, description: "Denormalized from scraper.repo.createdBy for access control" },
    },
    // Execution status
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "queued",
      options: [
        { label: "Queued", value: "queued" },
        { label: "Running", value: "running" },
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
        { label: "Timeout", value: "timeout" },
      ],
      index: true,
    },
    {
      name: "triggeredBy",
      type: "select",
      defaultValue: "manual",
      options: [
        { label: "Schedule", value: "schedule" },
        { label: "Manual", value: "manual" },
        { label: "Webhook", value: "webhook" },
      ],
    },
    // Timing
    { name: "startedAt", type: "date" },
    { name: "finishedAt", type: "date" },
    { name: "durationMs", type: "number" },
    // Process output
    { name: "exitCode", type: "number" },
    { name: "stdout", type: "textarea", admin: { description: "Standard output from the scraper process" } },
    { name: "stderr", type: "textarea", admin: { description: "Standard error from the scraper process" } },
    { name: "error", type: "text", admin: { description: "Error message if the run failed" } },
    // Output metrics
    { name: "outputRows", type: "number", admin: { description: "Number of CSV rows produced" } },
    { name: "outputBytes", type: "number", admin: { description: "Size of the output CSV in bytes" } },
    // Pipeline integration
    {
      name: "resultFile",
      type: "relationship",
      relationTo: "ingest-files",
      admin: { description: "Ingest file created from scraper output (when autoImport is enabled)" },
    },
  ],
};

export default ScraperRuns;
