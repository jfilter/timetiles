import type { Field } from "payload";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";

export const basicFields: Field[] = [
  {
    name: "fileName",
    type: "text",
    required: true,
    maxLength: 255,
    admin: {
      description: "System file name",
    },
  },
  {
    name: "originalName",
    type: "text",
    maxLength: 255,
    admin: {
      description: "Original user-friendly file name",
    },
  },
  {
    name: "catalog",
    type: "relationship",
    relationTo: "catalogs",
    required: true,
    hasMany: false,
  },
  {
    name: "fileSize",
    type: "number",
    admin: {
      description: "File size in bytes",
    },
  },
  {
    name: "mimeType",
    type: "text",
    maxLength: 100,
    admin: {
      description: "MIME type of the uploaded file",
    },
  },
  {
    name: "user",
    type: "relationship",
    relationTo: "users",
    admin: {
      description: "User who initiated the import (null for unauthenticated)",
    },
  },
  {
    name: "sessionId",
    type: "text",
    admin: {
      description: "Session ID for unauthenticated users",
    },
  },
  {
    name: "status",
    type: "select",
    options: [
      {
        label: "Pending",
        value: "pending",
      },
      {
        label: "Processing",
        value: "processing",
      },
      {
        label: "Completed",
        value: PROCESSING_STAGE.COMPLETED,
      },
      {
        label: "Failed",
        value: "failed",
      },
    ],
    defaultValue: "pending",
    admin: {
      position: "sidebar",
    },
  },
  {
    name: "processingStage",
    type: "select",
    options: [
      {
        label: "File Parsing",
        value: PROCESSING_STAGE.FILE_PARSING,
      },
      {
        label: "Row Processing",
        value: PROCESSING_STAGE.ROW_PROCESSING,
      },
      {
        label: "Geocoding",
        value: PROCESSING_STAGE.GEOCODING,
      },
      {
        label: "Event Creation",
        value: PROCESSING_STAGE.EVENT_CREATION,
      },
      {
        label: "Completed",
        value: PROCESSING_STAGE.COMPLETED,
      },
    ],
    defaultValue: "file-parsing",
    admin: {
      position: "sidebar",
      description: "Current processing stage",
    },
  },
  {
    name: "importedAt",
    type: "date",
    admin: {
      date: {
        pickerAppearance: "dayAndTime",
      },
      position: "sidebar",
    },
  },
  {
    name: "completedAt",
    type: "date",
    admin: {
      date: {
        pickerAppearance: "dayAndTime",
      },
      position: "sidebar",
      condition: (data) => data.status === "completed",
    },
  },
  {
    name: "rowCount",
    type: "number",
    required: true,
    admin: {
      description: "Total number of rows processed",
    },
  },
  {
    name: "errorCount",
    type: "number",
    defaultValue: 0,
    admin: {
      description: "Number of rows that failed processing",
    },
  },
  {
    name: "errorLog",
    type: "textarea",
    admin: {
      description: "Detailed error information",
      condition: (data) => data.errorCount > 0,
    },
  },
  {
    name: "rateLimitInfo",
    type: "json",
    admin: {
      description: "Rate limiting information for this import",
    },
  },
  {
    name: "metadata",
    type: "json",
    admin: {
      description: "Additional import context and metadata",
    },
  },
];
