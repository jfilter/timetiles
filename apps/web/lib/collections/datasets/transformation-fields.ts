/**
 * Field definitions for dataset transformation configurations.
 *
 * Unified transformation system for all data processing during import:
 * - Structural transforms: rename, concatenate, split
 * - String operations: uppercase, lowercase, trim, replace, expression
 * - Date parsing: format conversion
 *
 * Transform type metadata is derived from the canonical registry in
 * `@/lib/definitions/transform-registry`.
 *
 * @module
 */
import type { Field } from "payload";

import {
  getDateFormatInputOptions,
  getStringOperationOptions,
  getTransformTypeOptions,
} from "@/lib/definitions/transform-registry";

import { editorOrAdminCondition } from "../shared-fields";

/** Transform type constants for admin.condition callbacks. */
const TRANSFORM_TYPES = {
  RENAME: "rename",
  DATE_PARSE: "date-parse",
  STRING_OP: "string-op",
  CONCATENATE: "concatenate",
  SPLIT: "split",
  PARSE_JSON_ARRAY: "parse-json-array",
  SPLIT_TO_ARRAY: "split-to-array",
  EXTRACT: "extract",
} as const;

export const transformationFields: Field[] = [
  // Unified Import Transform Rules
  {
    name: "ingestTransforms",
    type: "array",
    admin: {
      condition: editorOrAdminCondition,
      description: "Transform rules applied to incoming data before validation (e.g., field renames)",
    },
    fields: [
      {
        name: "id",
        type: "text",
        required: true,
        defaultValue: () => crypto.randomUUID(),
        admin: { readOnly: true, description: "Unique identifier for this transform rule" },
      },
      {
        name: "type",
        type: "select",
        required: true,
        options: getTransformTypeOptions(),
        defaultValue: TRANSFORM_TYPES.RENAME,
        admin: { description: "Type of transformation to apply" },
      },
      // Common source field - used by rename, date-parse, string-op, split
      {
        name: "from",
        type: "text",
        admin: {
          description: "Source field path in import file (e.g., 'date' or 'user.email')",
          condition: (data) =>
            [
              TRANSFORM_TYPES.RENAME,
              TRANSFORM_TYPES.DATE_PARSE,
              TRANSFORM_TYPES.STRING_OP,
              TRANSFORM_TYPES.SPLIT,
              TRANSFORM_TYPES.PARSE_JSON_ARRAY,
              TRANSFORM_TYPES.SPLIT_TO_ARRAY,
              TRANSFORM_TYPES.EXTRACT,
              TRANSFORM_TYPES.PARSE_JSON_ARRAY,
            ].includes(data?.type),
        },
      },
      // Target field - used by rename, concatenate
      {
        name: "to",
        type: "text",
        admin: {
          description: "Target field path in dataset schema (e.g., 'start_date' or 'contact.email')",
          condition: (data) =>
            [
              TRANSFORM_TYPES.RENAME,
              TRANSFORM_TYPES.CONCATENATE,
              TRANSFORM_TYPES.EXTRACT,
              TRANSFORM_TYPES.STRING_OP,
              TRANSFORM_TYPES.PARSE_JSON_ARRAY,
            ].includes(data?.type),
        },
      },
      // Date parse specific fields
      {
        name: "inputFormat",
        type: "select",
        options: getDateFormatInputOptions(),
        admin: {
          description: "Expected input date format",
          condition: (data) => data?.type === TRANSFORM_TYPES.DATE_PARSE,
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
        admin: { description: "Output date format", condition: (data) => data?.type === TRANSFORM_TYPES.DATE_PARSE },
      },
      {
        name: "timezone",
        type: "text",
        admin: {
          description: "Optional timezone (e.g., 'America/New_York')",
          condition: (data) => data?.type === TRANSFORM_TYPES.DATE_PARSE,
        },
      },
      // String operation specific fields
      {
        name: "operation",
        type: "select",
        options: getStringOperationOptions(),
        admin: {
          description: "String operation to apply",
          condition: (data) => data?.type === TRANSFORM_TYPES.STRING_OP,
        },
      },
      {
        name: "pattern",
        type: "text",
        admin: {
          description: "Pattern (text for replace, regex for extract)",
          condition: (data) =>
            (data?.type === TRANSFORM_TYPES.STRING_OP && data?.operation === "replace") || data?.type === "extract",
        },
      },
      {
        name: "group",
        type: "number",
        admin: { description: "Regex capture group index (default: 1)", condition: (data) => data?.type === "extract" },
      },
      {
        name: "replacement",
        type: "text",
        admin: {
          description: "Replacement text",
          condition: (data) => data?.type === TRANSFORM_TYPES.STRING_OP && data?.operation === "replace",
        },
      },
      {
        name: "expression",
        type: "text",
        admin: {
          description:
            "Safe expression using the value variable. Functions: upper, lower, trim, concat, replace, substring, toNumber, parseDate, parseBool, round, floor, ceil, abs, len, ifEmpty. Example: upper(value) or toNumber(value)",
          condition: (data) => data?.type === TRANSFORM_TYPES.STRING_OP && data?.operation === "expression",
        },
      },
      // Concatenate specific fields
      {
        name: "fromFields",
        type: "json",
        admin: {
          description: 'Array of source field paths to concatenate (e.g., ["first_name", "last_name"])',
          condition: (data) => data?.type === TRANSFORM_TYPES.CONCATENATE,
        },
      },
      {
        name: "separator",
        type: "text",
        defaultValue: " ",
        admin: {
          description: "Separator between concatenated values",
          condition: (data) => data?.type === TRANSFORM_TYPES.CONCATENATE,
        },
      },
      // Split specific fields
      {
        name: "delimiter",
        type: "text",
        defaultValue: ",",
        admin: {
          description: "Delimiter to split on",
          condition: (data) => data?.type === TRANSFORM_TYPES.SPLIT || data?.type === TRANSFORM_TYPES.SPLIT_TO_ARRAY,
        },
      },
      {
        name: "toFields",
        type: "json",
        admin: {
          description: 'Array of target field names for split values (e.g., ["first_name", "last_name"])',
          condition: (data) => data?.type === TRANSFORM_TYPES.SPLIT,
        },
      },
      {
        name: "active",
        type: "checkbox",
        defaultValue: true,
        admin: { description: "Uncheck to disable without deleting" },
      },
      { name: "addedAt", type: "date", admin: { readOnly: true, description: "When this transform was created" } },
      {
        name: "addedBy",
        type: "relationship",
        relationTo: "users",
        admin: { readOnly: true, description: "User who created this transform" },
      },
      {
        name: "confidence",
        type: "number",
        min: 0,
        max: 100,
        admin: { readOnly: true, description: "Confidence score if auto-detected (0-100)" },
      },
      {
        name: "autoDetected",
        type: "checkbox",
        defaultValue: false,
        admin: { readOnly: true, description: "Whether this transform was suggested by auto-detection" },
      },
    ],
  },
];
