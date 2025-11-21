/**
 * Field definitions for dataset transformation configurations.
 *
 * Includes type transformations and import transform rules for data processing.
 *
 * @module
 */
import type { Field } from "payload";

export const transformationFields: Field[] = [
  // Type Transformations
  {
    name: "typeTransformations",
    type: "array",
    dbName: "transforms",
    admin: {
      condition: ({ req }) => req?.user?.role === "editor" || req?.user?.role === "admin",
      description: "Rules for handling type mismatches",
    },
    fields: [
      {
        name: "fieldPath",
        type: "text",
        required: true,
        admin: {
          description: "JSON path to field (e.g., 'temperature' or 'location.altitude')",
        },
      },
      {
        name: "fromType",
        type: "select",
        options: ["string", "number", "boolean", "null", "array", "object"],
        required: true,
      },
      {
        name: "toType",
        type: "select",
        options: ["string", "number", "boolean", "date", "array", "object"],
        required: true,
      },
      {
        name: "transformStrategy",
        type: "select",
        dbName: "strategy",
        options: [
          { label: "Parse (string to number/bool/date)", value: "parse" },
          { label: "Cast (toString, toNumber)", value: "cast" },
          { label: "Custom Function", value: "custom" },
          { label: "Reject", value: "reject" },
        ],
        required: true,
        defaultValue: "parse",
      },
      {
        name: "customTransform",
        type: "code",
        admin: {
          condition: (data) => data?.transformStrategy === "custom",
          language: "javascript",
          description: "Function(value, context) => transformedValue",
        },
      },
      {
        name: "enabled",
        type: "checkbox",
        defaultValue: true,
      },
    ],
  },
  // Import Transform Rules
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
          // Future: split, merge, transform, compute
        ],
        defaultValue: "rename",
        admin: {
          description: "Type of transformation to apply",
        },
      },
      {
        name: "from",
        type: "text",
        required: true,
        admin: {
          description: "Source field path in import file (e.g., 'date' or 'user.email')",
        },
      },
      {
        name: "to",
        type: "text",
        required: true,
        admin: {
          description: "Target field path in dataset schema (e.g., 'start_date' or 'contact.email')",
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
