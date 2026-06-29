/**
 * Core field definitions for scheduled ingests.
 *
 * Combines the basic identity fields, target configuration, and schedule
 * settings that together define a scheduled ingest's primary configuration.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

import { isValidTimezone } from "@/lib/utils/timezone";

import { createCreatedByField } from "../../shared-fields";
import { validateUrl } from "../validation";

// ---------------------------------------------------------------------------
// Basic fields — name, description, enabled flag, source URL
// ---------------------------------------------------------------------------

const basicFields: Field[] = [
  { name: "name", type: "text", required: true, admin: { description: "Descriptive name for this scheduled ingest" } },
  createCreatedByField("User who created this scheduled ingest", { required: true }),
  { name: "description", type: "textarea", admin: { description: "Optional description of what this import does" } },
  {
    name: "enabled",
    type: "checkbox",
    defaultValue: true,
    admin: { position: "sidebar", description: "Enable/disable this scheduled ingest" },
  },
  {
    name: "sourceUrl",
    type: "text",
    label: "Source URL",
    required: true,
    validate: validateUrl,
    admin: { description: "URL to fetch data from" },
  },
];

// ---------------------------------------------------------------------------
// Target fields — catalog, dataset, multi-sheet configuration
// ---------------------------------------------------------------------------

const targetFields: Field[] = [
  {
    name: "catalog",
    type: "relationship",
    relationTo: "catalogs",
    required: true,
    admin: { description: "Catalog to import data into" },
  },
  {
    name: "dataset",
    type: "relationship",
    relationTo: "datasets",
    admin: { description: "Target dataset for single-sheet imports" },
  },
  {
    name: "multiSheetConfig",
    type: "group",
    admin: { description: "Configuration for Excel files with multiple sheets" },
    fields: [
      {
        name: "enabled",
        type: "checkbox",
        defaultValue: false,
        admin: { description: "Enable multi-sheet import configuration" },
      },
      {
        name: "sheets",
        type: "array",
        admin: {
          condition: (_, siblingData) => siblingData?.enabled,
          description: "Configure dataset mapping for each sheet",
        },
        fields: [
          {
            name: "sheetIdentifier",
            type: "text",
            required: true,
            admin: { description: "Sheet name or index (0-based)" },
          },
          {
            name: "dataset",
            type: "relationship",
            relationTo: "datasets",
            required: true,
            admin: { description: "Target dataset for this sheet" },
          },
          {
            name: "skipIfMissing",
            type: "checkbox",
            defaultValue: false,
            admin: { description: "Skip this sheet if not found in the file" },
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Schedule fields — schedule type, frequency, cron, name template
// ---------------------------------------------------------------------------

const scheduleFields: Field[] = [
  {
    name: "scheduleType",
    type: "select",
    required: true,
    defaultValue: "frequency",
    options: [
      { label: "Frequency", value: "frequency" },
      { label: "Cron Expression", value: "cron" },
    ],
    admin: { description: "Choose scheduling method" },
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
    admin: { condition: (data) => data?.scheduleType === "frequency", description: "How often to run the import" },
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
    name: "timezone",
    type: "text",
    defaultValue: "UTC",
    validate: (val: string | null | undefined): string | true => {
      if (!val || val === "UTC") return true;
      if (!isValidTimezone(val)) {
        return `The following field is invalid: Timezone - "${val}" is not a valid IANA timezone (e.g., "Europe/Berlin", "America/New_York")`;
      }
      return true;
    },
    admin: {
      description:
        'IANA timezone for schedule evaluation (e.g., "Europe/Berlin", "America/New_York"). ' +
        "Cron expressions and frequency schedules are interpreted in this timezone. Defaults to UTC.",
    },
  },
  {
    name: "ingestNameTemplate",
    type: "text",
    defaultValue: "{{name}} - {{date}}",
    admin: {
      description: "Template for generated ingest names. Available variables: {{name}}, {{date}}, {{time}}, {{url}}",
    },
  },
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Data package tracking
// ---------------------------------------------------------------------------

const dataPackageFields: Field[] = [
  {
    name: "dataPackageSlug",
    type: "text",
    // Unique (not just indexed): one activation record per activation key.
    // activateDataPackage does an optimistic find-then-create on this value, so
    // two concurrent activations of the same package can both pass the existence
    // check and create duplicate scheduled ingests. The DB constraint is the
    // keystone that makes the loser fail; Postgres allows multiple NULLs, so the
    // vast majority of scheduled ingests (no data package) are unaffected.
    unique: true,
    admin: {
      readOnly: true,
      description: "Data package slug (set automatically when activated via data packages)",
      condition: (data) => Boolean(data?.dataPackageSlug),
    },
  },
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const coreFields: Field[] = [...basicFields, ...targetFields, ...scheduleFields, ...dataPackageFields];
