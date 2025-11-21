/**
 * Field definitions for import jobs collection.
 *
 * @module
 */
import type { Field } from "payload";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";

export const importJobFields: Field[] = [
  // Basic Information
  {
    name: "importFile",
    type: "relationship",
    relationTo: "import-files",
    required: true,
    admin: {
      description: "Source file for this import job",
    },
  },
  {
    name: "dataset",
    type: "relationship",
    relationTo: "datasets",
    required: true,
    admin: {
      description: "Target dataset for imported data",
    },
  },
  {
    name: "sheetIndex",
    type: "number",
    admin: {
      description: "Sheet index for Excel files (0-based)",
      condition: (data) => data.sheetIndex !== undefined,
    },
  },

  // Processing Stage
  {
    name: "stage",
    type: "select",
    required: true,
    defaultValue: PROCESSING_STAGE.ANALYZE_DUPLICATES,
    options: [
      { label: "Analyze Duplicates", value: PROCESSING_STAGE.ANALYZE_DUPLICATES },
      { label: "Detect Schema", value: PROCESSING_STAGE.DETECT_SCHEMA },
      { label: "Validate Schema", value: PROCESSING_STAGE.VALIDATE_SCHEMA },
      { label: "Await Approval", value: PROCESSING_STAGE.AWAIT_APPROVAL },
      { label: "Create Schema Version", value: PROCESSING_STAGE.CREATE_SCHEMA_VERSION },
      { label: "Geocode Batch", value: PROCESSING_STAGE.GEOCODE_BATCH },
      { label: "Create Events", value: PROCESSING_STAGE.CREATE_EVENTS },
      { label: "Completed", value: PROCESSING_STAGE.COMPLETED },
      { label: "Failed", value: PROCESSING_STAGE.FAILED },
    ],
    admin: {
      position: "sidebar",
      description: "Current processing stage",
    },
  },

  // Progress Tracking
  {
    name: "progress",
    type: "group",
    fields: [
      {
        name: "stages",
        type: "json",
        admin: {
          description: "Detailed progress information for each processing stage",
        },
      },
      {
        name: "overallPercentage",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Overall progress percentage (0-100), weighted by stage time estimates",
        },
      },
      {
        name: "estimatedCompletionTime",
        type: "date",
        admin: {
          description: "Estimated completion time for the entire import",
        },
      },
    ],
  },

  // Schema Detection
  {
    name: "schema",
    type: "json",
    admin: {
      description: "Detected JSON Schema from data",
      condition: (data) => data.schema,
    },
  },
  {
    name: "schemaBuilderState",
    type: "json",
    admin: {
      description: "Progressive schema builder state for continuity across batches",
      condition: (data) => [PROCESSING_STAGE.DETECT_SCHEMA, PROCESSING_STAGE.VALIDATE_SCHEMA].includes(data.stage),
    },
  },
  {
    name: "detectedFieldMappings",
    type: "group",
    label: "Field Mappings",
    admin: {
      description: "Detected or configured field mappings for standard event properties",
      condition: (data) =>
        [
          PROCESSING_STAGE.VALIDATE_SCHEMA,
          PROCESSING_STAGE.AWAIT_APPROVAL,
          PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
          PROCESSING_STAGE.GEOCODE_BATCH,
          PROCESSING_STAGE.CREATE_EVENTS,
          PROCESSING_STAGE.COMPLETED,
        ].includes(data.stage),
    },
    fields: [
      {
        name: "titlePath",
        type: "text",
        admin: {
          description: "Path to title/name field in source data",
          readOnly: true,
        },
      },
      {
        name: "descriptionPath",
        type: "text",
        admin: {
          description: "Path to description/details field in source data",
          readOnly: true,
        },
      },
      {
        name: "timestampPath",
        type: "text",
        admin: {
          description: "Path to timestamp/date field in source data",
          readOnly: true,
        },
      },
      {
        name: "latitudePath",
        type: "text",
        admin: {
          description: "Path to latitude coordinate field in source data",
          readOnly: true,
        },
      },
      {
        name: "longitudePath",
        type: "text",
        admin: {
          description: "Path to longitude coordinate field in source data",
          readOnly: true,
        },
      },
      {
        name: "locationPath",
        type: "text",
        admin: {
          description: "Path to location/address field in source data (for geocoding)",
          readOnly: true,
        },
      },
    ],
  },

  // Schema Validation
  {
    name: "schemaValidation",
    type: "group",
    admin: {
      condition: (data) =>
        [
          PROCESSING_STAGE.DETECT_SCHEMA,
          PROCESSING_STAGE.VALIDATE_SCHEMA,
          PROCESSING_STAGE.AWAIT_APPROVAL,
          PROCESSING_STAGE.GEOCODE_BATCH,
          PROCESSING_STAGE.CREATE_EVENTS,
          PROCESSING_STAGE.COMPLETED,
        ].includes(data.stage),
    },
    fields: [
      {
        name: "isCompatible",
        type: "checkbox",
        admin: {
          description: "Whether schema is compatible with dataset schema",
        },
      },
      {
        name: "breakingChanges",
        type: "json",
        admin: {
          description: "List of breaking schema changes",
          condition: (data) => data.schemaValidation?.breakingChanges?.length > 0,
        },
      },
      {
        name: "newFields",
        type: "json",
        admin: {
          description: "New fields detected (auto-grow candidates)",
          condition: (data) => data.schemaValidation?.newFields?.length > 0,
        },
      },
      {
        name: "transformSuggestions",
        type: "json",
        admin: {
          description: "Auto-detected field rename suggestions with confidence scores",
          condition: (data) => data.schemaValidation?.transformSuggestions?.length > 0,
        },
      },
      {
        name: "requiresApproval",
        type: "checkbox",
        admin: {
          description: "Whether manual approval is required",
        },
      },
      {
        name: "approvalReason",
        type: "text",
        admin: {
          description: "Reason why approval is required",
          condition: (data) => data.schemaValidation?.requiresApproval,
        },
      },
      {
        name: "approved",
        type: "checkbox",
        admin: {
          description: "Whether schema changes were approved",
          condition: (data) => data.schemaValidation?.requiresApproval,
        },
      },
      {
        name: "approvedBy",
        type: "relationship",
        relationTo: "users",
        admin: {
          description: "User who approved the schema",
          condition: (data) => data.schemaValidation?.approved,
        },
      },
      {
        name: "approvedAt",
        type: "date",
        admin: {
          description: "When schema was approved",
          condition: (data) => data.schemaValidation?.approved,
        },
      },
    ],
  },

  // Schema Version Reference
  {
    name: "datasetSchemaVersion",
    type: "relationship",
    relationTo: "dataset-schemas",
    admin: {
      description: "The schema version this import was validated against",
      condition: (data) => ["geocode-batch", "create-events", "completed"].includes(data.stage),
    },
  },

  // Duplicate Detection
  {
    name: "duplicates",
    type: "group",
    admin: {
      condition: (data) =>
        [
          PROCESSING_STAGE.DETECT_SCHEMA,
          PROCESSING_STAGE.VALIDATE_SCHEMA,
          PROCESSING_STAGE.AWAIT_APPROVAL,
          PROCESSING_STAGE.GEOCODE_BATCH,
          PROCESSING_STAGE.CREATE_EVENTS,
          PROCESSING_STAGE.COMPLETED,
        ].includes(data.stage),
    },
    fields: [
      {
        name: "strategy",
        type: "text",
        admin: {
          description: "Deduplication strategy used (external-id, computed-hash, etc.)",
        },
      },
      {
        name: "internal",
        type: "json",
        admin: {
          description: "Duplicates found within this import",
        },
      },
      {
        name: "external",
        type: "json",
        admin: {
          description: "Duplicates found with existing events",
        },
      },
      {
        name: "summary",
        type: "group",
        fields: [
          {
            name: "totalRows",
            type: "number",
            admin: {
              description: "Total rows analyzed",
            },
          },
          {
            name: "uniqueRows",
            type: "number",
            admin: {
              description: "Unique rows after deduplication",
            },
          },
          {
            name: "internalDuplicates",
            type: "number",
            admin: {
              description: "Duplicates within import",
            },
          },
          {
            name: "externalDuplicates",
            type: "number",
            admin: {
              description: "Duplicates with existing data",
            },
          },
        ],
      },
    ],
  },

  // Geocoding
  {
    name: "geocodingResults",
    type: "json",
    admin: {
      description: "Geocoding results by location string (locationString → coordinates)",
      condition: (data) => data.geocodingResults,
    },
  },

  // Results
  {
    name: "results",
    type: "json",
    admin: {
      description: "Processing results and statistics",
      condition: (data) => data.stage === "completed" || data.stage === "failed",
    },
  },

  // Errors
  {
    name: "errors",
    type: "array",
    admin: {
      description: "Processing errors by row",
      condition: (data) => data.errors?.length > 0,
    },
    fields: [
      {
        name: "row",
        type: "number",
        required: true,
      },
      {
        name: "error",
        type: "text",
        required: true,
      },
    ],
  },

  // Error Recovery Fields
  {
    name: "errorLog",
    type: "json",
    admin: {
      description: "Detailed error information and recovery attempts",
      condition: (data) => data.stage === "failed" || data.retryAttempts > 0,
    },
  },
  {
    name: "retryAttempts",
    type: "number",
    defaultValue: 0,
    admin: {
      description: "Number of retry attempts made",
    },
  },
  {
    name: "lastRetryAt",
    type: "date",
    admin: {
      date: {
        pickerAppearance: "dayAndTime",
      },
      description: "Timestamp of last retry attempt",
      condition: (data) => data.retryAttempts > 0,
    },
  },
  {
    name: "nextRetryAt",
    type: "date",
    admin: {
      date: {
        pickerAppearance: "dayAndTime",
      },
      description: "Scheduled time for next retry attempt",
      condition: (data) => data.stage === "failed" && data.retryAttempts > 0,
    },
  },
  {
    name: "lastSuccessfulStage",
    type: "select",
    options: [
      { label: "Analyze Duplicates", value: "analyze-duplicates" },
      { label: "Detect Schema", value: "detect-schema" },
      { label: "Validate Schema", value: "validate-schema" },
      { label: "Await Approval", value: "await-approval" },
      { label: "Geocode Batch", value: "geocode-batch" },
      { label: "Create Events", value: "create-events" },
    ],
    admin: {
      description: "Last stage completed successfully before failure",
      condition: (data) => data.stage === "failed",
    },
  },

  // Virtual Fields
  {
    name: "displayTitle",
    type: "text",
    virtual: true,
    admin: {
      hidden: true,
    },
    hooks: {
      afterRead: [
        ({ data }) => {
          const datasetName = typeof data?.dataset === "object" ? data.dataset.name : "Unknown Dataset";
          const fileName = typeof data?.importFile === "object" ? data.importFile.filename : "Unknown File";
          const sheetInfo = data?.sheetIndex !== undefined ? ` (Sheet ${data.sheetIndex + 1})` : "";
          return `${datasetName} - ${fileName}${sheetInfo}`;
        },
      ],
    },
  },
];
