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

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";

import { createRequestLogger } from "../logger";
import { getQuotaService } from "../services/quota-service";
import { getClientIdentifier, getRateLimitService } from "../services/rate-limit-service";
import { createCommonConfig } from "./shared-fields";

const logger = createRequestLogger("import-files");

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
    defaultColumns: ["originalName", "catalog", "status", "datasetsCount", "createdAt", "user"],
  },
  access: {
    // Import files can be read by their owner or admins
    // Unauthenticated users can only read their own session files
    read: async ({ req, id }) => {
      const { user, payload } = req;

      // Admins can read all
      if (user?.role === "admin") return true;

      // For findByID operations (id is provided)
      if (id) {
        if (!user) return false;

        try {
          // Fetch the file to check ownership
          const file = await payload.findByID({
            collection: "import-files",
            id,
            overrideAccess: true,
          });

          if (file?.user) {
            const userId = typeof file.user === "object" ? file.user.id : file.user;
            return user.id === userId;
          }

          return false;
        } catch {
          return false;
        }
      }

      // For find operations (query-based filtering)
      if (user) {
        return {
          user: { equals: user.id },
        };
      }

      // Unauthenticated users need sessionId match (handled in API layer)
      // For now, deny unauthenticated admin panel access
      return false;
    },

    // Anyone can create (upload) files (quota-checked in hooks)
    create: () => true,

    // Only file owner or admins can update
    update: async ({ req, id }) => {
      const { user, payload } = req;
      if (user?.role === "admin") return true;

      if (!user || !id) return false;

      try {
        // Fetch the existing import file with override to check ownership
        const existingFile = await payload.findByID({
          collection: "import-files",
          id,
          overrideAccess: true,
        });

        if (existingFile?.user) {
          const userId = typeof existingFile.user === "object" ? existingFile.user.id : existingFile.user;
          return user.id === userId;
        }

        return false;
      } catch {
        return false;
      }
    },

    // Only admins can delete
    delete: ({ req: { user } }) => user?.role === "admin",

    // Only admins can read version history
    readVersions: ({ req: { user } }) => user?.role === "admin",
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
    {
      name: "quotaInfo",
      type: "json",
      virtual: true,
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [
          async ({ req, data: _data }) => {
            // Only add quota info for authenticated users
            if (!req.user) return null;

            try {
              const quotaService = getQuotaService(req.payload);

              // Get multiple quota checks for comprehensive info
              const [fileUploads, importJobs, totalEvents] = await Promise.all([
                quotaService.checkQuota(req.user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY),
                quotaService.checkQuota(req.user, QUOTA_TYPES.IMPORT_JOBS_PER_DAY),
                quotaService.checkQuota(req.user, QUOTA_TYPES.TOTAL_EVENTS),
              ]);

              return {
                fileUploads: {
                  current: fileUploads.current,
                  limit: fileUploads.limit,
                  remaining: fileUploads.remaining,
                },
                importJobs: {
                  current: importJobs.current,
                  limit: importJobs.limit,
                  remaining: importJobs.remaining,
                },
                totalEvents: {
                  current: totalEvents.current,
                  limit: totalEvents.limit,
                  remaining: totalEvents.remaining,
                },
                resetTime: fileUploads.resetTime?.toISOString(),
                trustLevel: req.user.trustLevel,
              };
            } catch {
              // Don't fail the request if quota info can't be retrieved
              return null;
            }
          },
        ],
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
      async ({ data, req, operation }) => {
        // Only run on create operations
        if (operation !== "create") return data;

        const logger = createRequestLogger("import-files-validate");
        const user = req.user;

        // Check file upload quota
        if (user) {
          const quotaService = getQuotaService(req.payload);

          // Check daily file upload quota
          const uploadQuotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

          if (!uploadQuotaCheck.allowed) {
            throw new Error(
              `Daily file upload limit reached (${uploadQuotaCheck.current}/${uploadQuotaCheck.limit}). ` +
                `Resets at midnight UTC.`
            );
          }

          // Check file size quota based on trust level
          if (req.file) {
            const quotas = quotaService.getEffectiveQuotas(user);
            const maxSizeMB = quotas.maxFileSizeMB;
            const maxSizeBytes = maxSizeMB * 1024 * 1024;

            if (req.file.size > maxSizeBytes) {
              throw new Error(`File too large. Maximum size for your trust level: ${maxSizeMB}MB`);
            }

            logger.debug("File size validation passed", {
              filesize: req.file.size,
              maxSizeMB,
              trustLevel: user.trustLevel,
            });
          }
        } else {
          // Validate unauthenticated user file size limits
          if (req.file) {
            const maxSize = MAX_FILE_SIZE.unauthenticated;
            if (req.file.size > maxSize) {
              const sizeMB = Math.round(maxSize / 1024 / 1024);
              throw new Error(`File too large. Maximum size: ${sizeMB}MB`);
            }
            logger.debug("File size validation passed", {
              filesize: req.file.size,
              maxSize,
              isAuthenticated: false,
            });
          }
        }

        return data;
      },
    ],
    beforeChange: [
      ({ data, req, operation }) => {
        // Only run on create operations
        if (operation !== "create") return data;

        const logger = createRequestLogger("import-files-beforechange");

        // Trust-level-aware rate limiting check
        const rateLimitService = getRateLimitService(req.payload);
        const clientId = getClientIdentifier(req as unknown as Request);

        // Use trust-level-aware rate limiting
        const result = rateLimitService.checkTrustLevelRateLimit(clientId, req.user, "FILE_UPLOAD");

        if (!result.allowed) {
          logger.warn("Rate limit exceeded", {
            clientId,
            isAuthenticated: !!req.user,
            trustLevel: req.user?.trustLevel,
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

        // Track file upload usage for authenticated users
        if (req.user) {
          const quotaService = getQuotaService(req.payload);

          await quotaService.incrementUsage(req.user.id, USAGE_TYPES.FILE_UPLOADS_TODAY, 1);
        }

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
