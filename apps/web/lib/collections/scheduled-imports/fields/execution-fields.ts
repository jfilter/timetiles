/**
 * Execution tracking fields for scheduled imports.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

export const executionFields: Field[] = [
  // Retry Configuration
  {
    name: "retryConfig",
    type: "group",
    admin: {
      description: "Retry behavior configuration",
    },
    fields: [
      {
        name: "maxRetries",
        type: "number",
        defaultValue: 3,
        min: 0,
        max: 10,
        admin: {
          description: "Maximum number of retry attempts",
        },
      },
      {
        name: "retryDelayMinutes",
        type: "number",
        defaultValue: 5,
        min: 1,
        max: 60,
        admin: {
          description: "Delay between retries in minutes",
        },
      },
      {
        name: "exponentialBackoff",
        type: "checkbox",
        defaultValue: true,
        admin: {
          description: "Use exponential backoff for retries",
        },
      },
    ],
  },

  // Advanced Options
  {
    name: "advancedOptions",
    type: "group",
    admin: {
      description: "Advanced import options",
    },
    fields: [
      {
        name: "timeoutMinutes",
        type: "number",
        defaultValue: 30,
        min: 1,
        max: 120,
        admin: {
          description: "Maximum time to wait for response in minutes",
        },
      },
      {
        name: "skipDuplicateChecking",
        type: "checkbox",
        defaultValue: false,
        admin: {
          description: "Skip duplicate content checking",
        },
      },
      {
        name: "autoApproveSchema",
        type: "checkbox",
        defaultValue: false,
        admin: {
          description: "Automatically approve schema changes",
        },
      },
      {
        name: "maxFileSizeMB",
        type: "number",
        min: 1,
        max: 1000,
        admin: {
          description: "Maximum file size in MB (leave empty for no limit)",
        },
      },
      {
        name: "useHttpCache",
        type: "checkbox",
        defaultValue: true,
        admin: {
          description: "Enable HTTP caching for URL responses",
        },
      },
      {
        name: "bypassCacheOnManual",
        type: "checkbox",
        defaultValue: false,
        admin: {
          description: "Bypass cache when manually triggering the import",
        },
      },
      {
        name: "respectCacheControl",
        type: "checkbox",
        defaultValue: true,
        admin: {
          description: "Respect Cache-Control headers from the server",
        },
      },
    ],
  },

  // Execution Status Fields
  {
    name: "lastRun",
    type: "date",
    admin: {
      position: "sidebar",
      readOnly: true,
      description: "Last execution time",
    },
  },
  {
    name: "nextRun",
    type: "date",
    admin: {
      position: "sidebar",
      readOnly: true,
      description: "Next scheduled execution time",
    },
  },
  {
    name: "lastStatus",
    type: "select",
    options: [
      { label: "Success", value: "success" },
      { label: "Failed", value: "failed" },
      { label: "Running", value: "running" },
    ],
    admin: {
      position: "sidebar",
      readOnly: true,
      description: "Status of last execution",
    },
  },
  {
    name: "lastError",
    type: "text",
    admin: {
      readOnly: true,
      description: "Error message from last failed execution",
    },
  },
  {
    name: "currentRetries",
    type: "number",
    defaultValue: 0,
    admin: {
      readOnly: true,
      description: "Current retry attempt count",
    },
  },

  // Statistics
  {
    name: "statistics",
    type: "group",
    admin: {
      description: "Execution statistics",
      readOnly: true,
    },
    fields: [
      {
        name: "totalRuns",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Total number of executions",
        },
      },
      {
        name: "successfulRuns",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Number of successful executions",
        },
      },
      {
        name: "failedRuns",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Number of failed executions",
        },
      },
      {
        name: "averageDuration",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Average execution duration in milliseconds",
        },
      },
    ],
  },

  // Execution History
  {
    name: "executionHistory",
    type: "array",
    maxRows: 10,
    admin: {
      description: "History of recent executions",
      readOnly: true,
    },
    fields: [
      {
        name: "executedAt",
        type: "date",
        required: true,
      },
      {
        name: "status",
        type: "select",
        required: true,
        options: [
          { label: "Success", value: "success" },
          { label: "Failed", value: "failed" },
        ],
      },
      {
        name: "duration",
        type: "number",
        admin: {
          description: "Duration in milliseconds",
        },
      },
      {
        name: "recordsImported",
        type: "number",
      },
      {
        name: "error",
        type: "text",
      },
      {
        name: "jobId",
        type: "text",
        admin: {
          description: "Background job ID",
        },
      },
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
        admin: {
          description: "How this execution was triggered",
        },
      },
    ],
  },
];
