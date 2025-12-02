/**
 * Schema configuration field definitions for scheduled imports.
 *
 * These fields control how the scheduled import handles schema detection
 * and validation, and track the relationship to the original wizard import.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

export const schemaConfigFields: Field[] = [
  {
    name: "schemaMode",
    type: "select",
    defaultValue: "additive",
    options: [
      {
        label: "Strict - Schema must match exactly",
        value: "strict",
      },
      {
        label: "Additive - Accept new fields automatically",
        value: "additive",
      },
      {
        label: "Flexible - Require approval for changes",
        value: "flexible",
      },
    ],
    admin: {
      description:
        "How to handle schema changes during scheduled executions. " +
        "Strict: fail if schema differs. " +
        "Additive: auto-accept new fields. " +
        "Flexible: require approval for changes.",
    },
  },
  {
    name: "sourceImportFile",
    type: "relationship",
    relationTo: "import-files",
    admin: {
      readOnly: true,
      description: "The original import file this schedule was created from (via wizard)",
    },
  },
];
