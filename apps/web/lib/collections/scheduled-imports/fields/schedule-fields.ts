/**
 * Schedule configuration fields for scheduled imports.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

export const scheduleFields: Field[] = [
  {
    name: "scheduleType",
    type: "select",
    required: true,
    defaultValue: "frequency",
    options: [
      { label: "Frequency", value: "frequency" },
      { label: "Cron Expression", value: "cron" },
    ],
    admin: {
      description: "Choose scheduling method",
    },
  },
  {
    name: "frequency",
    type: "select",
    options: [
      { label: "Hourly", value: "hourly" },
      { label: "Daily", value: "daily" },
      { label: "Weekly", value: "weekly" },
      { label: "Monthly", value: "monthly" },
    ],
    admin: {
      condition: (data) => data?.scheduleType === "frequency",
      description: "How often to run the import",
    },
  },
  {
    name: "timezone",
    type: "select",
    defaultValue: "UTC",
    options: [
      { label: "UTC", value: "UTC" },
      { label: "Pacific/Midway", value: "Pacific/Midway" },
      { label: "Pacific/Niue", value: "Pacific/Niue" },
      { label: "Pacific/Honolulu", value: "Pacific/Honolulu" },
      { label: "Pacific/Rarotonga", value: "Pacific/Rarotonga" },
      { label: "America/Anchorage", value: "America/Anchorage" },
      { label: "Pacific/Gambier", value: "Pacific/Gambier" },
      { label: "America/Los_Angeles", value: "America/Los_Angeles" },
      { label: "America/Tijuana", value: "America/Tijuana" },
      { label: "America/Denver", value: "America/Denver" },
      { label: "America/Phoenix", value: "America/Phoenix" },
      { label: "America/Chicago", value: "America/Chicago" },
      { label: "America/Guatemala", value: "America/Guatemala" },
      { label: "America/New_York", value: "America/New_York" },
      { label: "America/Bogota", value: "America/Bogota" },
      { label: "America/Caracas", value: "America/Caracas" },
      { label: "America/Santiago", value: "America/Santiago" },
      { label: "America/Buenos_Aires", value: "America/Buenos_Aires" },
      { label: "America/Sao_Paulo", value: "America/Sao_Paulo" },
      { label: "Atlantic/South_Georgia", value: "Atlantic/South_Georgia" },
      { label: "Atlantic/Azores", value: "Atlantic/Azores" },
      { label: "Atlantic/Cape_Verde", value: "Atlantic/Cape_Verde" },
      { label: "Europe/London", value: "Europe/London" },
      { label: "Europe/Berlin", value: "Europe/Berlin" },
      { label: "Africa/Lagos", value: "Africa/Lagos" },
      { label: "Europe/Athens", value: "Europe/Athens" },
      { label: "Africa/Cairo", value: "Africa/Cairo" },
      { label: "Europe/Moscow", value: "Europe/Moscow" },
      { label: "Asia/Riyadh", value: "Asia/Riyadh" },
      { label: "Asia/Dubai", value: "Asia/Dubai" },
      { label: "Asia/Baku", value: "Asia/Baku" },
      { label: "Asia/Karachi", value: "Asia/Karachi" },
      { label: "Asia/Tashkent", value: "Asia/Tashkent" },
      { label: "Asia/Calcutta", value: "Asia/Calcutta" },
      { label: "Asia/Dhaka", value: "Asia/Dhaka" },
      { label: "Asia/Almaty", value: "Asia/Almaty" },
      { label: "Asia/Jakarta", value: "Asia/Jakarta" },
      { label: "Asia/Bangkok", value: "Asia/Bangkok" },
      { label: "Asia/Shanghai", value: "Asia/Shanghai" },
      { label: "Asia/Singapore", value: "Asia/Singapore" },
      { label: "Asia/Tokyo", value: "Asia/Tokyo" },
      { label: "Asia/Seoul", value: "Asia/Seoul" },
      { label: "Australia/Brisbane", value: "Australia/Brisbane" },
      { label: "Australia/Sydney", value: "Australia/Sydney" },
      { label: "Pacific/Guam", value: "Pacific/Guam" },
      { label: "Pacific/Noumea", value: "Pacific/Noumea" },
      { label: "Pacific/Auckland", value: "Pacific/Auckland" },
      { label: "Pacific/Fiji", value: "Pacific/Fiji" },
    ],
    admin: {
      description: "Timezone used when calculating scheduled boundaries and cron matches",
    },
  },
  {
    name: "cronExpression",
    type: "text",
    admin: {
      condition: (data) => data?.scheduleType === "cron",
      description: "Cron expression (e.g., '0 */6 * * *' for every 6 hours)",
    },
  },
  {
    name: "importNameTemplate",
    type: "text",
    defaultValue: "{{name}} - {{date}}",
    admin: {
      description: "Template for generated import names. Available variables: {{name}}, {{date}}, {{time}}, {{url}}",
    },
  },
];
