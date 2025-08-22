/**
 * Defines the Payload CMS collection configuration for Import Files.
 *
 * This collection acts as a record for every file uploaded to the system for data import.
 * It leverages Payload's `upload` functionality to store the file itself, while also tracking
 * extensive metadata about the import process, such as:
 * - The original filename and system filename.
 * - The user or session that initiated the import.
 * - The overall status of the import (e.g., pending, parsing, completed, failed).
 * - Information about the datasets detected within the file.
 * - A reference to the background job responsible for processing the file.
 *
 * An `afterChange` hook is used to automatically trigger the `dataset-detection` job
 * as soon as a new file is uploaded and created in this collection.
 *
 * @module
 */
import type { CollectionConfig } from "payload";
import { v4 as uuidv4 } from "uuid";

import { createRequestLogger } from "../logger";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "../services/rate-limit-service";

const logger = createRequestLogger("import-files");
import { COLLECTION_NAMES } from "@/lib/constants/import-constants";

import { createCommonConfig } from "./shared-fields";

const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.google-apps.spreadsheet",
  // "application/pdf",
  // "application/zip",
  // "application/x-zip-compressed",
  // "application/x-zip",
  // "application/x-tar",
  // "application/gzip",
  // "application/x-gzip",
  // "application/x-rar-compressed",
  // "application/xml",
];

// User-specific file size limits (enforced in beforeValidate hook)
// Note: Payload doesn't support collection-level size limits, so we handle this in hooks
const MAX_FILE_SIZE = {
  authenticated: 100 * 1024 * 1024, // 100MB for authenticated users
  unauthenticated: 10 * 1024 * 1024, // 10MB - stricter limit for unauthenticated users
};

const ImportFiles: CollectionConfig = {
  slug: "import-files",
  ...createCommonConfig({ drafts: false }),
  upload: {
    staticDir: process.env.UPLOAD_DIR_IMPORT_FILES!,
    mimeTypes: ALLOWED_MIME_TYPES,
  },
  admin: {
    useAsTitle: "originalName", // Use original user-friendly filename
    defaultColumns: ["originalName", "catalog", "status", "datasetsCount", "createdAt"],
  },
  access: {
    read: () => true,
    create: () => true, // Enable creation for uploads
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user?.role === "admin"),
  },
  fields: [
    // Payload automatically adds filename, mimeType, filesize fields when upload is enabled
    {
      name: "originalName",
      type: "text",
      maxLength: 255,
      admin: {
        description: "Original user-friendly file name",
        readOnly: true, // Set by beforeOperation hook
      },
    },
    {
      name: "catalog",
      type: "relationship",
      relationTo: "catalogs",
      required: false,
      hasMany: false,
      admin: {
        description: "The catalog this import belongs to (optional)",
      },
    },
    {
      name: "datasets",
      type: "relationship",
      relationTo: "datasets",
      required: false,
      hasMany: true,
      admin: {
        description: "Datasets detected in this import (optional)",
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
          label: "Parsing",
          value: "parsing",
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
      name: "datasetsCount",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Number of datasets detected in this catalog import",
      },
    },
    {
      name: "datasetsProcessed",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Number of datasets successfully processed",
      },
    },
    {
      name: "sheetMetadata",
      type: "json",
      admin: {
        description: "Information about detected sheets/datasets in the file",
      },
    },
    {
      name: "jobId",
      type: "text",
      admin: {
        description: "Payload job ID for tracking the catalog parsing job",
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
      name: "errorLog",
      type: "textarea",
      admin: {
        description: "Detailed error information",
        condition: (data) => data.status === "failed",
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
  ],
  hooks: {
    beforeOperation: [
      ({ operation, req }) => {
        // Only run on create operations
        if (operation !== "create") return;

        const logger = createRequestLogger("import-files-beforeoperation");

        // Handle file uploads (original logic)
        if (req.file) {
          // Store original filename for later use
          const originalName = req.file.name;

          // Check if this is already a URL import file (starts with "url-import-")
          // If so, keep the original filename to maintain consistency
          if (originalName.startsWith("url-import-")) {
            // Keep the URL import filename as-is
            logger.debug("Preserving URL import filename", {
              originalName,
            });
          } else {
            // Generate unique filename with timestamp and UUID to prevent conflicts
            const timestamp = Date.now();
            const uniqueId = uuidv4().substring(0, 8); // Short UUID for readability
            const fileExtension = originalName.split(".").pop() ?? "csv";
            const uniqueFilename = `${timestamp}-${uniqueId}.${fileExtension}`;

            // Update the file name
            req.file.name = uniqueFilename;

            logger.debug("Generated unique filename", {
              originalName,
              uniqueFilename,
              timestamp,
              uniqueId,
            });
          }

          // Store original name in request context for use in beforeChange hook
          (req as typeof req & { originalFileName?: string }).originalFileName = originalName;
        }
      },
    ],
    beforeValidate: [
      ({ data, req, operation }) => {
        // Only run on create operations
        if (operation !== "create") return data;

        const logger = createRequestLogger("import-files-validate");
        const user = req.user;

        // Validate user-specific file size limits (only for file uploads)
        if (req.file) {
          const maxSize = user ? MAX_FILE_SIZE.authenticated : MAX_FILE_SIZE.unauthenticated;
          if (req.file.size > maxSize) {
            const sizeMB = Math.round(maxSize / 1024 / 1024);
            throw new Error(`File too large. Maximum size: ${sizeMB}MB`);
          }
          logger.debug("File size validation passed", {
            filesize: req.file.size,
            maxSize,
            isAuthenticated: !!user,
          });
        }

        return data;
      },
    ],
    beforeChange: [
      ({ data, req, operation }) => {
        // Only run on create operations
        if (operation !== "create") return data;

        const logger = createRequestLogger("import-files-beforechange");

        // Rate limiting check
        const rateLimitService = getRateLimitService(req.payload);
        const clientId = getClientIdentifier(req as unknown as Request);
        const result = rateLimitService.checkConfiguredRateLimit(clientId, RATE_LIMITS.FILE_UPLOAD);

        if (!result.allowed) {
          logger.warn("Rate limit exceeded", {
            clientId,
            isAuthenticated: !!req.user,
            failedWindow: result.failedWindow,
          });
          throw new Error(
            `Too many import requests. Please try again later. (Limited by ${result.failedWindow} window)`
          );
        }

        // Extract custom metadata from the request
        // SessionId comes from the _payload data
        const sessionId = data.sessionId ?? null;
        const userAgent = req.headers?.get?.("user-agent") ?? null;

        // Get original filename from beforeOperation hook (for file uploads)
        // OR preserve the originalName if it's already set (for programmatic creation from url-fetch-job)
        const originalName =
          data.originalName ?? (req as typeof req & { originalFileName?: string }).originalFileName ?? null;

        // Add rate limiting and metadata info
        return {
          ...data,
          originalName, // Set or preserve the original filename
          sessionId: !req.user ? sessionId : undefined,
          rateLimitInfo: {
            clientId,
            isAuthenticated: !!req.user,
            timestamp: new Date().toISOString(),
          },
          metadata: {
            uploadSource: "api",
            userAgent,
            ...(data.metadata || {}),
          },
          importedAt: new Date().toISOString(),
        };
      },
    ],
    afterChange: [
      async ({ doc, req, operation }) => {
        // Only run on create
        if (operation !== "create") return doc;
        const { payload } = req;

        // Skip processing for duplicate imports (they're already marked as completed)
        if (doc.metadata?.urlFetch?.isDuplicate === true) {
          return doc;
        }

        // Check file type - reject JSON files (using Payload's auto-generated mimeType field)
        if (doc.mimeType?.includes("json")) {
          // Update the record immediately for JSON rejection
          try {
            await payload.update({
              collection: COLLECTION_NAMES.IMPORT_FILES,
              id: doc.id,
              data: {
                status: "failed",
                errorLog: "JSON file import not yet implemented",
                metadata: { error: "JSON not yet implemented" },
              },
            });
          } catch (error) {
            logger.error("Failed to update import-files record for JSON rejection", error);
          }
          return doc;
        }

        // Get the catalog if specified
        let catalog = null;
        if (doc.catalog) {
          catalog =
            typeof doc.catalog === "object"
              ? doc.catalog
              : await payload.findByID({ collection: COLLECTION_NAMES.CATALOGS, id: doc.catalog });
        }

        // Queue the dataset detection job to detect sheets/datasets
        try {
          const job = await payload.jobs.queue({
            task: "dataset-detection",
            input: {
              importFileId: doc.id,
              catalogId: catalog?.id,
            },
          });

          // Update with job ID
          try {
            await payload.update({
              collection: COLLECTION_NAMES.IMPORT_FILES,
              id: String(doc.id),
              data: {
                status: "parsing",
                jobId: String(job.id),
                importedAt: new Date().toISOString(),
              },
            });
          } catch (error) {
            logger.error("Failed to update import-files record with job ID", error);
          }
        } catch (error) {
          logger.error("Failed to queue dataset detection job", error);
        }

        return doc;
      },
    ],
  },
};

export default ImportFiles;
