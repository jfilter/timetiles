import type { Field } from "payload";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";

export const jobFields: Field[] = [
  {
    name: "currentJobId",
    type: "text",
    admin: {
      description: "Current Payload job ID being processed",
    },
  },
  {
    name: "jobHistory",
    type: "array",
    fields: [
      {
        name: "jobId",
        type: "text",
        required: true,
        admin: {
          description: "Payload job ID",
        },
      },
      {
        name: "jobType",
        type: "select",
        options: [
          {
            label: "File Parsing",
            value: PROCESSING_STAGE.FILE_PARSING,
          },
          {
            label: "Batch Processing",
            value: "batch-processing",
          },
          {
            label: "Geocoding Batch",
            value: "geocoding-batch",
          },
          {
            label: "Event Creation",
            value: PROCESSING_STAGE.EVENT_CREATION,
          },
        ],
        required: true,
      },
      {
        name: "status",
        type: "select",
        options: [
          {
            label: "Queued",
            value: "queued",
          },
          {
            label: "Running",
            value: "running",
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
        required: true,
      },
      {
        name: "startedAt",
        type: "date",
        admin: {
          date: {
            pickerAppearance: "dayAndTime",
          },
        },
      },
      {
        name: "completedAt",
        type: "date",
        admin: {
          date: {
            pickerAppearance: "dayAndTime",
          },
        },
      },
      {
        name: "error",
        type: "textarea",
        admin: {
          description: "Error message if job failed",
        },
      },
      {
        name: "result",
        type: "json",
        admin: {
          description: "Job result data",
        },
      },
    ],
    admin: {
      description: "History of all jobs for this import",
    },
  },
];
