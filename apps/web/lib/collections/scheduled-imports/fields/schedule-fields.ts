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
