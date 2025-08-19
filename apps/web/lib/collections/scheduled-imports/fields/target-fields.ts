/**
 * Target configuration fields for scheduled imports.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

export const targetFields: Field[] = [
  {
    name: "catalog",
    type: "relationship",
    relationTo: "catalogs",
    required: true,
    admin: {
      description: "Catalog to import data into",
    },
  },
  {
    name: "dataset",
    type: "relationship",
    relationTo: "datasets",
    admin: {
      description: "Target dataset for single-sheet imports",
    },
  },
  {
    name: "multiSheetConfig",
    type: "group",
    admin: {
      description: "Configuration for Excel files with multiple sheets",
    },
    fields: [
      {
        name: "enabled",
        type: "checkbox",
        defaultValue: false,
        admin: {
          description: "Enable multi-sheet import configuration",
        },
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
              description: "Skip this sheet if not found in the file",
            },
          },
        ],
      },
    ],
  },
];
