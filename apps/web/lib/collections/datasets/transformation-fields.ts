/**
 * Field definitions for dataset transformation configurations.
 *
 * Unified transformation system for all data processing during import:
 * - Structural transforms: rename, concatenate, split
 * - String operations: uppercase, lowercase, trim, replace
 * - Date parsing: format conversion
 * - Type casting: parse/cast values between types
 *
 * @module
 */
import type { Field } from "payload";

export const transformationFields: Field[] = [
  // Unified Import Transform Rules
  {
    name: "importTransforms",
    type: "array",
    admin: {
      condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
      description: "Transform rules applied to incoming data before validation (e.g., field renames)",
    },
    fields: [
      {
        name: "id",
        type: "text",
        required: true,
        defaultValue: () => crypto.randomUUID(),
        admin: {
          readOnly: true,
          description: "Unique identifier for this transform rule",
        },
      },
      {
        name: "type",
        type: "select",
        required: true,
        options: [
          { label: "Rename Field", value: "rename" },
          { label: "Parse Date", value: "date-parse" },
          { label: "String Operation", value: "string-op" },
          { label: "Concatenate Fields", value: "concatenate" },
          { label: "Split Field", value: "split" },
          { label: "Convert Type", value: "type-cast" },
        ],
        defaultValue: "rename",
        admin: {
          description: "Type of transformation to apply",
        },
      },
      // Common source field - used by rename, date-parse, string-op, split, type-cast
      {
        name: "from",
        type: "text",
        admin: {
          description: "Source field path in import file (e.g., 'date' or 'user.email')",
          condition: (data) => ["rename", "date-parse", "string-op", "split", "type-cast"].includes(data?.type),
        },
      },
      // Target field - used by rename, concatenate
      {
        name: "to",
        type: "text",
        admin: {
          description: "Target field path in dataset schema (e.g., 'start_date' or 'contact.email')",
          condition: (data) => ["rename", "concatenate"].includes(data?.type),
        },
      },
      // Date parse specific fields
      {
        name: "inputFormat",
        type: "select",
        options: [
          { label: "DD/MM/YYYY (31/12/2024)", value: "DD/MM/YYYY" },
          { label: "MM/DD/YYYY (12/31/2024)", value: "MM/DD/YYYY" },
          { label: "YYYY-MM-DD (2024-12-31)", value: "YYYY-MM-DD" },
          { label: "DD-MM-YYYY (31-12-2024)", value: "DD-MM-YYYY" },
          { label: "MM-DD-YYYY (12-31-2024)", value: "MM-DD-YYYY" },
          { label: "DD.MM.YYYY (31.12.2024)", value: "DD.MM.YYYY" },
        ],
        admin: {
          description: "Expected input date format",
          condition: (data) => data?.type === "date-parse",
        },
      },
      {
        name: "outputFormat",
        type: "select",
        defaultValue: "YYYY-MM-DD",
        options: [
          { label: "YYYY-MM-DD (ISO)", value: "YYYY-MM-DD" },
          { label: "DD/MM/YYYY", value: "DD/MM/YYYY" },
          { label: "MM/DD/YYYY", value: "MM/DD/YYYY" },
        ],
        admin: {
          description: "Output date format",
          condition: (data) => data?.type === "date-parse",
        },
      },
      {
        name: "timezone",
        type: "text",
        admin: {
          description: "Optional timezone (e.g., 'America/New_York')",
          condition: (data) => data?.type === "date-parse",
        },
      },
      // String operation specific fields
      {
        name: "operation",
        type: "select",
        options: [
          { label: "Uppercase", value: "uppercase" },
          { label: "Lowercase", value: "lowercase" },
          { label: "Trim Whitespace", value: "trim" },
          { label: "Find & Replace", value: "replace" },
        ],
        admin: {
          description: "String operation to apply",
          condition: (data) => data?.type === "string-op",
        },
      },
      {
        name: "pattern",
        type: "text",
        admin: {
          description: "Text pattern to find (for replace operation)",
          condition: (data) => data?.type === "string-op" && data?.operation === "replace",
        },
      },
      {
        name: "replacement",
        type: "text",
        admin: {
          description: "Replacement text",
          condition: (data) => data?.type === "string-op" && data?.operation === "replace",
        },
      },
      // Concatenate specific fields
      {
        name: "fromFields",
        type: "json",
        admin: {
          description: 'Array of source field paths to concatenate (e.g., ["first_name", "last_name"])',
          condition: (data) => data?.type === "concatenate",
        },
      },
      {
        name: "separator",
        type: "text",
        defaultValue: " ",
        admin: {
          description: "Separator between concatenated values",
          condition: (data) => data?.type === "concatenate",
        },
      },
      // Split specific fields
      {
        name: "delimiter",
        type: "text",
        defaultValue: ",",
        admin: {
          description: "Delimiter to split on",
          condition: (data) => data?.type === "split",
        },
      },
      {
        name: "toFields",
        type: "json",
        admin: {
          description: 'Array of target field names for split values (e.g., ["first_name", "last_name"])',
          condition: (data) => data?.type === "split",
        },
      },
      // Type-cast specific fields
      {
        name: "fromType",
        type: "select",
        options: [
          { label: "Text", value: "string" },
          { label: "Number", value: "number" },
          { label: "Boolean", value: "boolean" },
          { label: "Date", value: "date" },
          { label: "Array", value: "array" },
          { label: "Object", value: "object" },
          { label: "Null", value: "null" },
        ],
        admin: {
          description: "Expected source type",
          condition: (data) => data?.type === "type-cast",
        },
      },
      {
        name: "toType",
        type: "select",
        options: [
          { label: "Text", value: "string" },
          { label: "Number", value: "number" },
          { label: "Boolean", value: "boolean" },
          { label: "Date", value: "date" },
          { label: "Array", value: "array" },
          { label: "Object", value: "object" },
        ],
        admin: {
          description: "Target type to convert to",
          condition: (data) => data?.type === "type-cast",
        },
      },
      {
        name: "strategy",
        type: "select",
        options: [
          { label: "Parse (intelligent conversion)", value: "parse" },
          { label: "Cast (direct coercion)", value: "cast" },
          { label: "Custom Function", value: "custom" },
          { label: "Reject (fail on mismatch)", value: "reject" },
        ],
        defaultValue: "parse",
        admin: {
          description: "Strategy for performing the conversion",
          condition: (data) => data?.type === "type-cast",
        },
      },
      {
        name: "customFunction",
        type: "code",
        admin: {
          language: "javascript",
          description: "Custom JavaScript: (value, context) => transformedValue",
          condition: (data) => data?.type === "type-cast" && data?.strategy === "custom",
        },
      },
      {
        name: "active",
        type: "checkbox",
        defaultValue: true,
        admin: {
          description: "Uncheck to disable without deleting",
        },
      },
      {
        name: "addedAt",
        type: "date",
        admin: {
          readOnly: true,
          description: "When this transform was created",
        },
      },
      {
        name: "addedBy",
        type: "relationship",
        relationTo: "users",
        admin: {
          readOnly: true,
          description: "User who created this transform",
        },
      },
      {
        name: "confidence",
        type: "number",
        min: 0,
        max: 100,
        admin: {
          readOnly: true,
          description: "Confidence score if auto-detected (0-100)",
        },
      },
      {
        name: "autoDetected",
        type: "checkbox",
        defaultValue: false,
        admin: {
          readOnly: true,
          description: "Whether this transform was suggested by auto-detection",
        },
      },
    ],
  },
];
