import type { CollectionConfig } from "payload";

const Imports: CollectionConfig = {
  slug: "imports",
  admin: {
    useAsTitle: "originalName",
    defaultColumns: [
      "originalName",
      "catalog",
      "status",
      "processingStage",
      "progress",
      "createdAt",
    ],
  },
  access: {
    read: () => true, // Will be handled in API endpoints
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
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
          value: "completed",
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
          value: "file-parsing",
        },
        {
          label: "Row Processing",
          value: "row-processing",
        },
        {
          label: "Geocoding",
          value: "geocoding",
        },
        {
          label: "Event Creation",
          value: "event-creation",
        },
        {
          label: "Completed",
          value: "completed",
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
    {
      name: "geocodingStats",
      type: "group",
      fields: [
        {
          name: "totalAddresses",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Total addresses to geocode",
          },
        },
        {
          name: "successfulGeocodes",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Successfully geocoded addresses",
          },
        },
        {
          name: "failedGeocodes",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Failed geocoding attempts",
          },
        },
        {
          name: "cachedResults",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Results from cache",
          },
        },
        {
          name: "googleApiCalls",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Google Maps API calls made",
          },
        },
        {
          name: "nominatimApiCalls",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Nominatim API calls made",
          },
        },
        {
          name: "preExistingCoordinates",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Rows with coordinates from import"
          }
        },
        {
          name: "skippedGeocoding",
          type: "number", 
          defaultValue: 0,
          admin: {
            description: "Rows where geocoding was skipped"
          }
        }
      ],
      admin: {
        description: "Geocoding statistics",
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
              value: "file-parsing",
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
              value: "event-creation",
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
              value: "completed",
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
    {
      name: "coordinateDetection",
      type: "group",
      fields: [
        {
          name: "detected",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Were coordinate columns detected in the import?"
          }
        },
        {
          name: "detectionMethod",
          type: "select",
          options: [
            { label: "Column Name Pattern", value: "pattern" },
            { label: "Heuristic Analysis", value: "heuristic" },
            { label: "User Specified", value: "manual" },
            { label: "Not Detected", value: "none" }
          ],
          admin: {
            condition: (data) => data.coordinateDetection?.detected
          }
        },
        {
          name: "columnMapping",
          type: "group",
          fields: [
            {
              name: "latitudeColumn",
              type: "text"
            },
            {
              name: "longitudeColumn",
              type: "text"
            },
            {
              name: "combinedColumn",
              type: "text"
            },
            {
              name: "coordinateFormat",
              type: "select",
              dbName: "coord_fmt",  // Shortened database name
              options: [
                { label: "Decimal Degrees", value: "decimal" },
                { label: "DMS (Degrees Minutes Seconds)", value: "dms" },
                { label: "Combined (lat,lon)", value: "combined_comma" },
                { label: "Combined (lat lon)", value: "combined_space" },
                { label: "GeoJSON", value: "geojson" }
              ]
            }
          ],
          admin: {
            condition: (data) => data.coordinateDetection?.detected
          }
        },
        {
          name: "detectionConfidence",
          type: "number",
          min: 0,
          max: 1,
          admin: {
            step: 0.01,
            description: "Confidence in coordinate detection (0-1)"
          }
        },
        {
          name: "sampleValidation",
          type: "group",
          fields: [
            {
              name: "validSamples",
              type: "number",
              defaultValue: 0
            },
            {
              name: "invalidSamples",
              type: "number",
              defaultValue: 0
            },
            {
              name: "swappedCoordinates",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Were lat/lon likely swapped?"
              }
            }
          ]
        }
      ],
      admin: {
        description: "Coordinate column detection information"
      }
    },
    {
      name: "metadata",
      type: "json",
      admin: {
        description: "Additional import context and metadata",
      },
    },
  ],
  timestamps: true,
};

export default Imports;
