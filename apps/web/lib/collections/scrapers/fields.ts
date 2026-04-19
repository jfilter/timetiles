/**
 * Field definitions for the scrapers collection.
 *
 * @module
 */
import type { Field } from "payload";

import { computeWebhookUrl } from "@/lib/services/webhook-registry";

import { validateEntrypoint, validateEnvVars } from "./validation";

export const scraperFields: Field[] = [
  { name: "name", type: "text", required: true, maxLength: 255 },
  { name: "slug", type: "text", required: true, maxLength: 255, index: true },
  // Relationship to repo
  {
    name: "repo",
    type: "relationship",
    relationTo: "scraper-repos",
    required: true,
    admin: { description: "Source code repository containing this scraper" },
  },
  // Denormalized owner for zero-query access control (server-set only)
  {
    name: "repoCreatedBy",
    type: "number",
    index: true,
    admin: { hidden: true, readOnly: true, description: "Denormalized from repo.createdBy for access control" },
  },
  // Execution config
  {
    name: "runtime",
    type: "select",
    required: true,
    defaultValue: "python",
    options: [
      { label: "Python", value: "python" },
      { label: "Node.js", value: "node" },
    ],
  },
  {
    name: "entrypoint",
    type: "text",
    required: true,
    validate: validateEntrypoint,
    admin: { description: "Script path relative to repo root (e.g., scraper.py)" },
  },
  { name: "outputFile", type: "text", defaultValue: "data.csv", admin: { description: "Output CSV filename" } },
  // Scheduling
  {
    name: "schedule",
    type: "text",
    admin: { description: "Cron expression (e.g., 0 6 * * *). Leave empty for manual-only." },
  },
  { name: "enabled", type: "checkbox", defaultValue: true },
  // Resource limits
  {
    name: "timeoutSecs",
    type: "number",
    defaultValue: 300,
    min: 10,
    max: 3600,
    admin: { description: "Max execution time in seconds" },
  },
  {
    name: "memoryMb",
    type: "number",
    defaultValue: 512,
    min: 64,
    max: 4096,
    admin: { description: "Memory limit in MB" },
  },
  // Environment variables (may contain secrets — field-level access as defense-in-depth)
  {
    name: "envVars",
    type: "json",
    defaultValue: {},
    validate: validateEnvVars,
    access: { read: ({ req: { user } }) => user?.role === "admin" },
    admin: { description: "Environment variables passed to the scraper" },
  },
  // TimeTiles integration
  {
    name: "targetDataset",
    type: "relationship",
    relationTo: "datasets",
    admin: { description: "Dataset to import scraped data into" },
  },
  {
    name: "autoImport",
    type: "checkbox",
    defaultValue: false,
    admin: { description: "Automatically import CSV into target dataset after successful scrape" },
  },
  // Data quality review checks
  {
    name: "reviewChecks",
    type: "group",
    label: "Data Quality Review Checks",
    admin: {
      description:
        "Configure which data quality checks pause the import for review. All checks are enabled by default.",
      condition: (data) => data?.autoImport === true,
    },
    fields: [
      {
        name: "skipTimestampCheck",
        type: "checkbox",
        defaultValue: false,
        label: "Skip 'no timestamp' check",
        admin: { description: "Don't pause when no date/time field is detected", width: "50%" },
      },
      {
        name: "skipLocationCheck",
        type: "checkbox",
        defaultValue: false,
        label: "Skip 'no location' check",
        admin: { description: "Don't pause when no location field is detected", width: "50%" },
      },
      {
        name: "skipEmptyRowCheck",
        type: "checkbox",
        defaultValue: false,
        label: "Skip 'high empty rows' check",
        admin: { description: "Don't pause when many rows are empty", width: "50%" },
      },
      {
        name: "skipRowErrorCheck",
        type: "checkbox",
        defaultValue: false,
        label: "Skip 'high row errors' check",
        admin: { description: "Don't pause when many rows fail during creation", width: "50%" },
      },
      {
        name: "skipDuplicateRateCheck",
        type: "checkbox",
        defaultValue: false,
        label: "Skip 'high duplicates' check",
        admin: { description: "Don't pause when most rows are duplicates", width: "50%" },
      },
      {
        name: "skipGeocodingCheck",
        type: "checkbox",
        defaultValue: false,
        label: "Skip 'geocoding failure' check",
        admin: { description: "Don't pause when geocoding has a high failure rate", width: "50%" },
      },
      {
        name: "emptyRowThreshold",
        type: "number",
        min: 0,
        max: 1,
        admin: {
          description: "Override empty row rate threshold (0–1). Leave blank for global default.",
          step: 0.05,
          width: "50%",
        },
      },
      {
        name: "rowErrorThreshold",
        type: "number",
        min: 0,
        max: 1,
        admin: {
          description: "Override row error rate threshold (0–1). Leave blank for global default.",
          step: 0.05,
          width: "50%",
        },
      },
      {
        name: "duplicateRateThreshold",
        type: "number",
        min: 0,
        max: 1,
        admin: {
          description: "Override duplicate rate threshold (0–1). Leave blank for global default.",
          step: 0.05,
          width: "50%",
        },
      },
      {
        name: "geocodingFailureThreshold",
        type: "number",
        min: 0,
        max: 1,
        admin: {
          description: "Override geocoding failure threshold (0–1). Leave blank for global default.",
          step: 0.05,
          width: "50%",
        },
      },
    ],
  },
  // Runtime stats (updated by jobs, read-only in admin)
  { name: "lastRunAt", type: "date", admin: { readOnly: true, position: "sidebar" } },
  {
    name: "lastRunStatus",
    type: "select",
    options: [
      { label: "Success", value: "success" },
      { label: "Failed", value: "failed" },
      { label: "Timeout", value: "timeout" },
      { label: "Running", value: "running" },
    ],
    admin: { readOnly: true, position: "sidebar" },
  },
  {
    name: "statistics",
    type: "json",
    defaultValue: { totalRuns: 0, successRuns: 0, failedRuns: 0 },
    admin: { readOnly: true },
  },
  // Next scheduled run
  { name: "nextRunAt", type: "date", admin: { readOnly: true, position: "sidebar" } },
  // Webhook trigger
  {
    name: "webhookEnabled",
    type: "checkbox",
    defaultValue: false,
    admin: { description: "Enable webhook trigger for this scraper" },
  },
  {
    name: "webhookToken",
    type: "text",
    maxLength: 64,
    index: true,
    access: { read: () => false },
    admin: { hidden: true },
  },
  {
    name: "webhookUrl",
    type: "text",
    admin: {
      readOnly: true,
      description: "POST to this URL to trigger the scraper",
      condition: (data) => Boolean(data?.webhookEnabled && data?.webhookToken),
    },
    hooks: { afterRead: [({ data }) => computeWebhookUrl(data)] },
  },
];
