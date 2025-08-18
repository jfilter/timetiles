/**
 * Defines the Payload CMS collection configuration for Scheduled Imports.
 *
 * This collection manages scheduled URL-based imports that run automatically at specified intervals.
 * Each document represents a schedule configuration that triggers import-files records when due.
 *
 * Key features:
 * - Cron-based scheduling with timezone support
 * - Authentication configuration for secure URLs
 * - Automatic retry handling with exponential backoff
 * - Execution history tracking
 * - Integration with existing import pipeline
 *
 * @module ScheduledImports
 */

import type { CollectionConfig } from "payload";

import { createCommonConfig } from "./shared-fields";

const ScheduledImports: CollectionConfig = {
  slug: "scheduled-imports",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "sourceUrl", "enabled", "nextRun", "lastRun", "updatedAt"],
    group: "Import System",
    description: "Manage scheduled URL imports that run automatically",
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => user?.role === "admin" || false,
  },
  fields: [
    // Basic Information
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: "Descriptive name for this scheduled import",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Optional description of what this import does",
      },
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Enable/disable this scheduled import",
      },
    },

    // Source Configuration
    {
      name: "sourceUrl",
      type: "text",
      label: "Source URL",
      required: true,
      validate: (val: string | null | undefined) => {
        if (!val) return "URL is required";
        if (!/^https?:\/\/.+/.exec(val)) {
          return "URL must start with http:// or https://";
        }
        return true;
      },
      admin: {
        description: "URL to fetch data from",
      },
    },
    {
      name: "authConfig",
      type: "group",
      admin: {
        description: "Authentication configuration for accessing the URL",
      },
      fields: [
        {
          name: "type",
          type: "select",
          options: [
            { label: "None", value: "none" },
            { label: "API Key (Header)", value: "api-key" },
            { label: "Bearer Token", value: "bearer" },
            { label: "Basic Auth", value: "basic" },
          ],
          defaultValue: "none",
        },
        {
          name: "apiKey",
          type: "text",
          admin: {
            condition: (data) => data?.authConfig?.type === "api-key",
            description: "API key value",
          },
        },
        {
          name: "apiKeyHeader",
          type: "text",
          defaultValue: "X-API-Key",
          admin: {
            condition: (data) => data?.authConfig?.type === "api-key",
            description: "Header name for API key",
          },
        },
        {
          name: "bearerToken",
          type: "text",
          admin: {
            condition: (data) => data?.authConfig?.type === "bearer",
            description: "Bearer token value",
          },
        },
        {
          name: "basicUsername",
          type: "text",
          admin: {
            condition: (data) => data?.authConfig?.type === "basic",
            description: "Basic auth username",
          },
        },
        {
          name: "basicPassword",
          type: "text",
          admin: {
            condition: (data) => data?.authConfig?.type === "basic",
            description: "Basic auth password",
          },
        },
        {
          name: "customHeaders",
          type: "json",
          admin: {
            description: "Additional custom headers as JSON object",
          },
        },
      ],
    },

    // Target Configuration
    {
      name: "catalog",
      type: "relationship",
      relationTo: "catalogs",
      admin: {
        description: "Target catalog for imported data",
      },
    },
    {
      name: "datasetMapping",
      type: "group",
      admin: {
        description: "Configuration for mapping source data to datasets",
      },
      fields: [
        {
          name: "mappingType",
          type: "select",
          defaultValue: "auto",
          options: [
            { label: "Auto-detect (Create new datasets as needed)", value: "auto" },
            { label: "Single dataset (CSV or single sheet)", value: "single" },
            { label: "Multiple datasets (Specific sheets)", value: "multiple" },
          ],
          admin: {
            description: "How to map the source data to datasets",
          },
        },
        {
          name: "singleDataset",
          type: "relationship",
          relationTo: "datasets",
          admin: {
            description: "Target dataset for single-dataset imports",
            condition: (data) => data?.datasetMapping?.mappingType === "single",
          },
        },
        {
          name: "sheetMappings",
          type: "array",
          admin: {
            description: "Map specific sheets to datasets",
            condition: (data) => data?.datasetMapping?.mappingType === "multiple",
          },
          fields: [
            {
              name: "sheetIdentifier",
              type: "text",
              required: true,
              admin: {
                description: "Sheet name or index (0-based)",
              },
            },
            {
              name: "dataset",
              type: "relationship",
              relationTo: "datasets",
              required: true,
              admin: {
                description: "Target dataset for this sheet",
              },
            },
            {
              name: "skipIfMissing",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Skip this sheet if not found (instead of failing)",
              },
            },
          ],
        },
      ],
    },
    {
      name: "importNameTemplate",
      type: "text",
      defaultValue: "{{name}} - {{date}}",
      admin: {
        description: "Template for import file names. Supports: {{name}}, {{date}}, {{time}}, {{url}}",
      },
    },

    // Schedule Configuration
    {
      name: "scheduleType",
      type: "select",
      defaultValue: "frequency",
      required: true,
      options: [
        { label: "Simple Frequency", value: "frequency" },
        { label: "Advanced (Cron)", value: "cron" },
      ],
      admin: {
        position: "sidebar",
        description: "Choose between simple frequency or advanced cron scheduling",
      },
    },
    {
      name: "frequency",
      type: "select",
      options: [
        { label: "Hourly (at the start of each hour UTC)", value: "hourly" },
        { label: "Daily (at midnight UTC)", value: "daily" },
        { label: "Weekly (Sunday at midnight UTC)", value: "weekly" },
        { label: "Monthly (1st of month at midnight UTC)", value: "monthly" },
      ],
      admin: {
        position: "sidebar",
        description: "How often to run this import",
        condition: (data) => data?.scheduleType === "frequency",
      },
      validate: (val: string | null | undefined, { data }: any) => {
        if (data?.scheduleType === "frequency" && !val) {
          return "Frequency is required";
        }
        return true;
      },
    },
    {
      name: "cronExpression",
      type: "text",
      admin: {
        description: "Cron expression in UTC (e.g., '0 0 * * *' for daily at midnight UTC)",
        condition: (data) => data?.scheduleType === "cron",
      },
      validate: (val: string | null | undefined, { data }: any) => {
        if (data?.scheduleType === "cron") {
          if (!val) return "Cron expression is required";

          // Split and validate cron expression
          const parts = val.trim().split(/\s+/);
          if (parts.length !== 5) {
            return "Cron expression must have exactly 5 fields (minute hour day month weekday)";
          }

          const [minute, hour, day, month, weekday] = parts;

          // Helper function to validate numeric values
          const validateField = (field: string, min: number, max: number, name: string): string | true => {
            if (field === "*") return true;

            // Handle ranges (e.g., "1-5")
            if (field.includes("-")) {
              const parts = field.split("-");
              if (parts.length !== 2) {
                return `Invalid ${name} range format in cron expression`;
              }
              const [start, end] = parts;
              const startVal = parseInt(start || "");
              const endVal = parseInt(end || "");
              if (isNaN(startVal) || isNaN(endVal) || startVal < min || endVal > max || startVal > endVal) {
                return `Invalid ${name} range in cron expression (must be ${min}-${max})`;
              }
              return true;
            }

            // Handle steps (e.g., "*/5")
            if (field.startsWith("*/")) {
              const step = parseInt(field.substring(2));
              if (isNaN(step) || step <= 0) {
                return `Invalid ${name} step value in cron expression`;
              }
              return true;
            }

            // Handle lists (e.g., "1,3,5")
            if (field.includes(",")) {
              const values = field.split(",");
              for (const v of values) {
                const num = parseInt(v);
                if (isNaN(num) || num < min || num > max) {
                  return `Invalid ${name} value ${v} in cron expression (must be ${min}-${max})`;
                }
              }
              return true;
            }

            // Simple numeric value
            const num = parseInt(field);
            if (isNaN(num) || num < min || num > max) {
              return `Invalid ${name} value in cron expression (must be ${min}-${max})`;
            }
            return true;
          };

          // Validate each field
          const minuteValid = validateField(minute || "", 0, 59, "minute");
          if (minuteValid !== true) return minuteValid;

          const hourValid = validateField(hour || "", 0, 23, "hour");
          if (hourValid !== true) return hourValid;

          const dayValid = validateField(day || "", 1, 31, "day");
          if (dayValid !== true) return dayValid;

          const monthValid = validateField(month || "", 1, 12, "month");
          if (monthValid !== true) return monthValid;

          const weekdayValid = validateField(weekday || "", 0, 7, "weekday");
          if (weekdayValid !== true) return weekdayValid;
        }
        return true;
      },
    },
    {
      name: "maxRetries",
      type: "number",
      defaultValue: 3,
      min: 0,
      max: 10,
      admin: {
        description: "Maximum retry attempts on failure",
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
      name: "timeoutSeconds",
      type: "number",
      defaultValue: 300,
      min: 30,
      max: 1800,
      admin: {
        description: "Timeout for URL fetch in seconds",
      },
    },

    // Execution Tracking
    {
      name: "lastRun",
      type: "date",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Last time this import was executed",
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "nextRun",
      type: "date",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Next scheduled execution time",
        date: {
          pickerAppearance: "dayAndTime",
        },
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
      type: "textarea",
      admin: {
        readOnly: true,
        description: "Error message from last failed execution",
        condition: (data) => data?.lastStatus === "failed",
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
    {
      name: "executionHistory",
      type: "array",
      maxRows: 10,
      admin: {
        description: "Recent execution history (last 10 runs)",
        readOnly: true,
      },
      fields: [
        {
          name: "executedAt",
          type: "date",
          required: true,
          admin: {
            date: {
              pickerAppearance: "dayAndTime",
            },
          },
        },
        {
          name: "status",
          type: "select",
          options: [
            { label: "Success", value: "success" },
            { label: "Failed", value: "failed" },
          ],
          required: true,
        },
        {
          name: "importFileId",
          type: "text",
          admin: {
            description: "ID of the created import-files record",
          },
        },
        {
          name: "error",
          type: "text",
          admin: {
            description: "Error message if failed",
          },
        },
        {
          name: "duration",
          type: "number",
          admin: {
            description: "Execution duration in seconds",
          },
        },
      ],
    },

    // Statistics
    {
      name: "statistics",
      type: "group",
      admin: {
        description: "Execution statistics",
      },
      fields: [
        {
          name: "totalRuns",
          type: "number",
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: "Total number of executions",
          },
        },
        {
          name: "successfulRuns",
          type: "number",
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: "Number of successful executions",
          },
        },
        {
          name: "failedRuns",
          type: "number",
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: "Number of failed executions",
          },
        },
        {
          name: "averageDuration",
          type: "number",
          admin: {
            readOnly: true,
            description: "Average execution duration in seconds",
          },
        },
      ],
    },

    // Advanced Configuration
    {
      name: "advancedConfig",
      type: "group",
      admin: {
        description: "Advanced configuration options",
      },
      fields: [
        {
          name: "skipDuplicateCheck",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Skip checking if URL content has changed since last run",
          },
        },
        {
          name: "expectedContentType",
          type: "select",
          options: [
            { label: "Auto-detect", value: "auto" },
            { label: "CSV", value: "csv" },
            { label: "JSON", value: "json" },
            { label: "Excel (XLS)", value: "xls" },
            { label: "Excel (XLSX)", value: "xlsx" },
          ],
          defaultValue: "auto",
          admin: {
            description: "Expected content type (helps with format detection)",
          },
          dbName: "exp_content_type",
        },
        {
          name: "maxFileSize",
          type: "number",
          defaultValue: 100,
          min: 1,
          max: 500,
          admin: {
            description: "Maximum file size in MB",
          },
        },
      ],
    },

    // Metadata
    {
      name: "metadata",
      type: "json",
      admin: {
        description: "Additional metadata and notes",
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        // Calculate next run time when creating or enabling a schedule
        if (
          (operation === "create" || (operation === "update" && data.enabled)) &&
          (data.cronExpression || data.frequency)
        ) {
          // Calculate initial nextRun based on frequency or cron
          if (!data.nextRun && data.frequency) {
            const now = new Date();
            const next = new Date(now);
            next.setUTCSeconds(0);
            next.setUTCMilliseconds(0);

            switch (data.frequency) {
              case "hourly":
                next.setUTCMinutes(0);
                next.setUTCHours(next.getUTCHours() + 1);
                break;
              case "daily":
                next.setUTCMinutes(0);
                next.setUTCHours(0);
                next.setUTCDate(next.getUTCDate() + 1);
                break;
              case "weekly":
                next.setUTCMinutes(0);
                next.setUTCHours(0);
                const daysUntilSunday = 7 - next.getUTCDay() || 7;
                next.setUTCDate(next.getUTCDate() + daysUntilSunday);
                break;
              case "monthly":
                next.setUTCMinutes(0);
                next.setUTCHours(0);
                next.setUTCDate(1);
                next.setUTCMonth(next.getUTCMonth() + 1);
                break;
            }
            data.nextRun = next;
          }

          // This would be calculated by the schedule manager
          // For now, just ensure the fields exist
          if (!data.statistics) {
            data.statistics = {
              totalRuns: 0,
              successfulRuns: 0,
              failedRuns: 0,
              averageDuration: 0,
            };
          }
        }

        // Clear fields based on schedule type
        if (data.scheduleType === "frequency") {
          data.cronExpression = null;
        } else if (data.scheduleType === "cron") {
          data.frequency = null;
        }

        return data;
      },
    ],
  },
};

export default ScheduledImports;
