/**
 * Runtime and operational fields for scheduled ingests.
 *
 * Combines execution tracking (retry config, status, statistics, history)
 * and webhook configuration that support the operational lifecycle of a
 * scheduled ingest.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

import { getBaseUrl } from "@/lib/utils/base-url";

// ---------------------------------------------------------------------------
// Execution tracking fields
// ---------------------------------------------------------------------------

const executionFields: Field[] = [
  // Retry Configuration
  {
    name: "retryConfig",
    type: "group",
    admin: { description: "Retry behavior configuration" },
    fields: [
      {
        name: "maxRetries",
        type: "number",
        defaultValue: 3,
        min: 0,
        max: 10,
        admin: { description: "Maximum number of retry attempts" },
      },
      {
        name: "retryDelayMinutes",
        type: "number",
        defaultValue: 5,
        min: 1,
        max: 60,
        admin: { description: "Delay between retries in minutes" },
      },
      {
        name: "exponentialBackoff",
        type: "checkbox",
        defaultValue: true,
        admin: { description: "Use exponential backoff for retries" },
      },
    ],
  },

  // Advanced Options
  {
    name: "advancedOptions",
    type: "group",
    admin: { description: "Advanced import options" },
    fields: [
      {
        name: "timeoutMinutes",
        type: "number",
        defaultValue: 30,
        min: 1,
        max: 120,
        admin: { description: "Maximum time to wait for response in minutes" },
      },
      {
        name: "skipDuplicateChecking",
        type: "checkbox",
        defaultValue: false,
        admin: { description: "Skip duplicate content checking" },
      },
      {
        name: "autoApproveSchema",
        type: "checkbox",
        defaultValue: false,
        admin: { description: "Automatically approve schema changes" },
      },
      {
        name: "maxFileSizeMB",
        type: "number",
        min: 1,
        max: 1000,
        admin: { description: "Maximum file size in MB (leave empty for no limit)" },
      },
      {
        name: "useHttpCache",
        type: "checkbox",
        defaultValue: true,
        admin: { description: "Enable HTTP caching for URL responses" },
      },
      {
        name: "bypassCacheOnManual",
        type: "checkbox",
        defaultValue: false,
        admin: { description: "Bypass cache when manually triggering the import" },
      },
      {
        name: "respectCacheControl",
        type: "checkbox",
        defaultValue: true,
        admin: { description: "Respect Cache-Control headers from the server" },
      },
      {
        name: "responseFormat",
        type: "select",
        enumName: "si_response_format",
        defaultValue: "auto",
        options: [
          { label: "Auto-detect", value: "auto" },
          { label: "CSV / Excel", value: "csv" },
          { label: "JSON API", value: "json" },
        ],
        admin: { description: "Expected response format from the URL" },
      },
      {
        name: "jsonApiConfig",
        type: "group",
        admin: {
          description: "Configure JSON API response handling",
          condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
            siblingData?.responseFormat === "json",
        },
        fields: [
          {
            name: "recordsPath",
            type: "text",
            admin: {
              description: 'Dot-path to the records array (e.g. "data.results"). Leave empty for auto-detection.',
              placeholder: "data.results",
            },
          },
          {
            name: "pagination",
            type: "group",
            admin: { description: "Configure paginated API fetching" },
            fields: [
              {
                name: "enabled",
                type: "checkbox",
                defaultValue: false,
                admin: { description: "Enable pagination to fetch multiple pages" },
              },
              {
                name: "type",
                type: "select",
                enumName: "si_json_paging_type",
                options: [
                  { label: "Offset / Limit", value: "offset" },
                  { label: "Cursor-based", value: "cursor" },
                  { label: "Page number", value: "page" },
                ],
                admin: {
                  description: "Pagination strategy",
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true,
                },
              },
              {
                name: "pageParam",
                type: "text",
                defaultValue: "page",
                admin: {
                  description: 'Query parameter for page/offset (e.g. "page", "offset")',
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true && siblingData?.type !== "cursor",
                },
              },
              {
                name: "limitParam",
                type: "text",
                defaultValue: "limit",
                admin: {
                  description: "Query parameter for page size",
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true,
                },
              },
              {
                name: "limitValue",
                type: "number",
                defaultValue: 100,
                min: 1,
                max: 10000,
                admin: {
                  description: "Records per page",
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true,
                },
              },
              {
                name: "cursorParam",
                type: "text",
                admin: {
                  description: "Query parameter to send cursor value",
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true && siblingData?.type === "cursor",
                },
              },
              {
                name: "nextCursorPath",
                type: "text",
                admin: {
                  description: 'Dot-path to next cursor in response (e.g. "meta.next_cursor")',
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true && siblingData?.type === "cursor",
                },
              },
              {
                name: "totalPath",
                type: "text",
                admin: {
                  description: 'Dot-path to total record count (e.g. "meta.total")',
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true,
                },
              },
              {
                name: "maxPages",
                type: "number",
                defaultValue: 50,
                min: 1,
                max: 500,
                admin: {
                  description: "Maximum number of pages to fetch (safety limit)",
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true,
                },
              },
              {
                name: "maxRecords",
                type: "number",
                min: 1,
                admin: {
                  description:
                    "Maximum total records to fetch across all pages. " +
                    "Default: 100,000. Increase for large datasets (e.g. 500,000 for tree inventories).",
                  condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
                    siblingData?.enabled === true,
                },
              },
            ],
          },
        ],
      },
      {
        name: "reviewChecks",
        type: "group",
        label: "Data Quality Review Checks",
        admin: {
          description:
            "Configure which data quality checks pause the import for review. All checks are enabled by default.",
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
              description: "Override geocoding failure rate threshold (0–1). Leave blank for global default.",
              step: 0.05,
              width: "50%",
            },
          },
        ],
      },
      {
        name: "geocodingBias",
        type: "group",
        label: "Geocoding Region Bias",
        admin: {
          description:
            "Bias geocoding results towards a known region. Helps avoid ambiguous results " +
            "(e.g. 'Odessa' → Ukraine instead of Texas).",
        },
        fields: [
          {
            name: "countryCodes",
            type: "json",
            admin: {
              description:
                'ISO 3166-1 alpha-2 country codes as JSON array (e.g. ["ua", "pl"]). ' +
                "Restricts geocoding results to these countries.",
            },
          },
          {
            name: "viewBox",
            type: "group",
            admin: { description: "Bounding box to prefer results within a geographic area." },
            fields: [
              { name: "minLon", type: "number", admin: { width: "25%", step: 0.001 } },
              { name: "minLat", type: "number", admin: { width: "25%", step: 0.001 } },
              { name: "maxLon", type: "number", admin: { width: "25%", step: 0.001 } },
              { name: "maxLat", type: "number", admin: { width: "25%", step: 0.001 } },
            ],
          },
          {
            name: "bounded",
            type: "checkbox",
            defaultValue: false,
            admin: { description: "Strictly restrict results to the view box (not just prefer)" },
          },
        ],
      },
    ],
  },

  // Pre-processing (JSON record grouping/merging before CSV conversion)
  {
    name: "preProcessing",
    type: "group",
    label: "Pre-Processing",
    admin: {
      description:
        "Group JSON records by a key and merge date fields (e.g. collapse recurring events into date ranges).",
    },
    fields: [
      { name: "groupBy", type: "text", admin: { description: "Field to group records by (e.g. 'uid')", width: "50%" } },
      {
        name: "mergeFields",
        type: "json",
        admin: {
          description: 'Fields to merge with min/max: e.g. {"startDate": "min", "endDate": "max"}',
          width: "50%",
        },
      },
    ],
  },

  // Execution Status Fields
  { name: "lastRun", type: "date", admin: { position: "sidebar", readOnly: true, description: "Last execution time" } },
  {
    name: "nextRun",
    type: "date",
    admin: { position: "sidebar", readOnly: true, description: "Next scheduled execution time" },
  },
  {
    name: "lastStatus",
    type: "select",
    options: [
      { label: "Success", value: "success" },
      { label: "Failed", value: "failed" },
      { label: "Running", value: "running" },
    ],
    admin: { position: "sidebar", readOnly: true, description: "Status of last execution" },
  },
  {
    name: "lastError",
    type: "text",
    admin: { readOnly: true, description: "Error message from last failed execution" },
  },
  {
    name: "currentRetries",
    type: "number",
    defaultValue: 0,
    admin: { readOnly: true, description: "Current retry attempt count" },
  },

  // Statistics
  {
    name: "statistics",
    type: "group",
    admin: { description: "Execution statistics", readOnly: true },
    fields: [
      { name: "totalRuns", type: "number", defaultValue: 0, admin: { description: "Total number of executions" } },
      {
        name: "successfulRuns",
        type: "number",
        defaultValue: 0,
        admin: { description: "Number of successful executions" },
      },
      { name: "failedRuns", type: "number", defaultValue: 0, admin: { description: "Number of failed executions" } },
      {
        name: "averageDuration",
        type: "number",
        defaultValue: 0,
        admin: { description: "Average execution duration in milliseconds" },
      },
    ],
  },

  // Execution History
  {
    name: "executionHistory",
    type: "array",
    maxRows: 10,
    admin: { description: "History of recent executions", readOnly: true },
    fields: [
      { name: "executedAt", type: "date", required: true },
      {
        name: "status",
        type: "select",
        required: true,
        options: [
          { label: "Success", value: "success" },
          { label: "Failed", value: "failed" },
        ],
      },
      { name: "duration", type: "number", admin: { description: "Duration in milliseconds" } },
      { name: "recordsImported", type: "number" },
      { name: "error", type: "text" },
      { name: "jobId", type: "text", admin: { description: "Background job ID" } },
      {
        name: "triggeredBy",
        type: "select",
        dbName: "trig_by", // Shortened to avoid PostgreSQL identifier length limit
        options: [
          { label: "Schedule", value: "schedule" },
          { label: "Webhook", value: "webhook" },
          { label: "Manual", value: "manual" },
          { label: "System", value: "system" },
        ],
        defaultValue: "schedule",
        admin: { description: "How this execution was triggered" },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Webhook fields
// ---------------------------------------------------------------------------

const webhookFields: Field[] = [
  {
    name: "webhookEnabled",
    type: "checkbox",
    defaultValue: false,
    admin: { position: "sidebar", description: "Enable webhook URL for triggering this import on-demand" },
  },
  {
    name: "webhookToken",
    type: "text",
    maxLength: 64,
    admin: {
      hidden: true, // Not shown in UI, only stored in DB
    },
  },
  {
    name: "webhookUrl",
    type: "text",
    admin: {
      readOnly: true,
      description: "POST to this URL to trigger the import",
      condition: (data) => Boolean(data?.webhookEnabled && data?.webhookToken),
    },
    hooks: {
      afterRead: [
        ({ data }) => {
          if (data?.webhookEnabled && data?.webhookToken) {
            const baseUrl = getBaseUrl();
            return `${baseUrl}/api/webhooks/trigger/${data.webhookToken}`;
          }
          return null;
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const runtimeFields: Field[] = [...executionFields, ...webhookFields];
