import type { Field } from "payload";

export const progressFields: Field[] = [
  {
    name: "progress",
    type: "group",
    fields: [
      {
        name: "totalRows",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Total number of rows to process",
        },
      },
      {
        name: "processedRows",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Number of rows processed",
        },
      },
      {
        name: "geocodedRows",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Number of rows geocoded",
        },
      },
      {
        name: "createdEvents",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Number of events created",
        },
      },
      {
        name: "percentage",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Overall completion percentage",
        },
      },
    ],
    admin: {
      description: "Processing progress tracking",
    },
  },
  {
    name: "batchInfo",
    type: "group",
    fields: [
      {
        name: "batchSize",
        type: "number",
        defaultValue: 100,
        admin: {
          description: "Number of rows per batch",
        },
      },
      {
        name: "currentBatch",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Current batch being processed",
        },
      },
      {
        name: "totalBatches",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Total number of batches",
        },
      },
    ],
    admin: {
      description: "Batch processing information",
    },
  },
];
