/**
 * Lifecycle hooks for import files collection.
 *
 * @module
 */
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from "payload";
import type { Payload } from "payload";
import { v4 as uuidv4 } from "uuid";

import { validateCatalogOwnership } from "@/lib/collections/catalog-ownership";
import { getEnv } from "@/lib/config/env";
import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import type { User } from "@/payload-types";

import { createRequestLogger } from "../../logger";
import { createQuotaService } from "../../services/quota-service";
import { getClientIdentifier, getRateLimitService } from "../../services/rate-limit-service";

const logger = createRequestLogger("ingest-files");

/** Check upload rate limits unless seed/test context. Returns clientId if rate-limited. */
export const enforceUploadRateLimit = async (
  data: Record<string, unknown>,
  req: { payload: Payload; user?: User | null; headers?: Headers },
  hookLogger: ReturnType<typeof createRequestLogger>
): Promise<string | undefined> => {
  const isSeedData =
    data.metadata &&
    typeof data.metadata === "object" &&
    "source" in data.metadata &&
    data.metadata.source === "seed-data";

  const env = getEnv();
  const isTestEnv = env.NODE_ENV === "test" || env.DATABASE_URL?.includes("_test");

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- logical OR is intentional
  if (isSeedData || isTestEnv) return undefined;

  const rateLimitService = getRateLimitService(req.payload);
  const clientId = getClientIdentifier(req as unknown as Request);
  const result = await rateLimitService.checkTrustLevelRateLimit(clientId, req.user, "FILE_UPLOAD");

  if (!result.allowed) {
    hookLogger.warn("Rate limit exceeded", {
      clientId,
      isAuthenticated: !!req.user,
      trustLevel: req.user?.trustLevel,
      failedWindow: result.failedWindow,
    });
    throw new Error(`Too many import requests. Please try again later. (Limited by ${result.failedWindow} window)`);
  }

  return clientId;
};

export const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.google-apps.spreadsheet",
  "application/json",
  "application/geo+json",
];

export const beforeOperationHooks: CollectionBeforeOperationHook[] = [
  ({ operation, req }) => {
    // Only run on create operations
    if (operation !== "create") return;
    // Skip during seeding
    if (req.context?.seed) return;

    const logger = createRequestLogger("import-files-beforeoperation");

    // Handle file uploads
    if (req.file) {
      // Store original filename for later use
      const originalName = req.file.name;

      // Always store original name in request context for use in beforeChange hook
      (req as typeof req & { originalFileName?: string }).originalFileName = originalName;

      // Check if this is already a URL import file (starts with "url-import-")
      // If so, keep the original filename to maintain consistency
      if (originalName.startsWith("url-import-")) {
        // Keep the URL import filename as-is
        logger.debug("Preserving URL import filename", { originalName });
      } else {
        // Generate unique filename with timestamp and UUID to prevent conflicts
        const timestamp = Date.now();
        const uniqueId = uuidv4().substring(0, 8); // Short UUID for readability
        const fileExtension = originalName.split(".").pop() ?? "csv";
        const uniqueFilename = `${timestamp}-${uniqueId}.${fileExtension}`;

        // Update the file name
        req.file.name = uniqueFilename;

        logger.debug("Generated unique filename", { originalName, uniqueFilename, timestamp, uniqueId });
      }
    }
  },
];

export const beforeValidateHooks: CollectionBeforeValidateHook[] = [
  async ({ data, req, operation }) => {
    // Only run on create operations
    if (operation !== "create") return data;

    // Skip all validation during seeding
    if (req.context?.seed) return data;

    const logger = createRequestLogger("import-files-validate");
    const user = req.user;

    // Skip validation for local API calls without a user (test/system operations)
    // These bypass access control via overrideAccess: true
    // Real API requests always have req.payloadAPI === "REST" or "GraphQL"
    if (!user && req.payloadAPI !== "REST" && req.payloadAPI !== "GraphQL") {
      logger.debug("Skipping authentication check for local API operation");
      return data;
    }

    // Authentication is required for external API requests
    if (!user) {
      throw new Error("Authentication required to upload files");
    }

    const quotaService = createQuotaService(req.payload);

    // Check daily file upload quota
    const uploadQuotaCheck = await quotaService.checkQuota(user, "FILE_UPLOADS_PER_DAY", 1);

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
      // Payload's local API may not preserve file.size — fall back to data.length
      const fileSize = req.file.size ?? req.file.data?.length;

      if (fileSize && fileSize > maxSizeBytes) {
        throw new Error(`File too large. Maximum size for your trust level: ${maxSizeMB}MB`);
      }

      logger.debug("File size validation passed", { filesize: fileSize, maxSizeMB, trustLevel: user.trustLevel });
    }

    return data;
  },
];

export const beforeChangeHooks: CollectionBeforeChangeHook[] = [
  async ({ data, req, operation }) => {
    // Only run on create operations
    if (operation !== "create") return data;
    // Skip during seeding — seed data provides all fields directly
    if (req.context?.seed) return data;

    const changeLogger = createRequestLogger("import-files-beforechange");
    const clientId = await enforceUploadRateLimit(data, req, changeLogger);

    // Extract custom metadata from the request
    const userAgent = req.headers?.get?.("user-agent") ?? null;

    // Get original filename from beforeOperation hook (for file uploads)
    // OR preserve the originalName if it's already set (for programmatic creation from url-fetch-job)
    const originalName =
      data.originalName ?? (req as typeof req & { originalFileName?: string }).originalFileName ?? null;

    if (data.catalog && req.user) await validateCatalogOwnership(req.payload, data.catalog, req.user, req);

    // Add rate limiting and metadata info
    return {
      ...data,
      originalName, // Set or preserve the original filename
      user: req.user?.id, // Set the authenticated user
      ...(clientId && { rateLimitInfo: { clientId, isAuthenticated: true, timestamp: new Date().toISOString() } }),
      metadata: { uploadSource: "api", userAgent, ...data.metadata },
      uploadedAt: new Date().toISOString(),
    };
  },
];

export const afterChangeHooks: CollectionAfterChangeHook[] = [
  async ({ doc, req, operation }) => {
    // Only run on create
    if (operation !== "create") return doc;
    const { payload } = req;

    // Skip hook processing for programmatic creation (e.g., url-fetch-job handles its own pipeline)
    if (req.context?.skipIngestFileHooks) return doc;

    // Track file upload usage (authentication is required)
    const quotaService = createQuotaService(req.payload);
    await quotaService.incrementUsage(req.user!.id, "FILE_UPLOADS_PER_DAY", 1, req);

    // Skip processing for duplicate imports (they're already marked as completed)
    if (doc.metadata?.urlFetch?.isDuplicate === true) {
      return doc;
    }

    // Queue the manual-ingest workflow to process the file through the full pipeline.
    //
    // Ordering (status-first, queue-second, reconcile-third):
    // 1. Flip status to "parsing" before queueing. If this update fails we
    //    bail out without ever queueing a job, so we cannot leak a running
    //    workflow whose owning file is still "pending".
    // 2. Queue the job. If this throws, mark the file "failed" and exit.
    //    Nothing to reconcile — the job never left our process.
    // 3. Reconcile the real jobId onto the file. This update is best-effort:
    //    if it fails, the workflow still runs (operators can find the file
    //    via workflow.input.ingestFileId), but the sidebar jobId column is
    //    left blank. We accept that trade-off to avoid cancelling running
    //    work on a transient DB hiccup.
    try {
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: String(doc.id),
        req, // Pass req to stay in same transaction
        data: { status: "parsing", uploadedAt: new Date().toISOString() },
        context: { ...req.context, skipIngestFileHooks: true },
      });
    } catch (error) {
      logger.error("Failed to mark import-file as parsing; skipping queue", error);
      return doc;
    }

    let queuedJobId: string | undefined;
    try {
      const job = await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(doc.id) } });
      queuedJobId = String(job.id);
    } catch (error) {
      logger.error("Failed to queue manual-ingest workflow", error);
      try {
        await payload.update({
          collection: COLLECTION_NAMES.INGEST_FILES,
          id: String(doc.id),
          req,
          data: {
            status: "failed",
            errorLog: `Failed to queue processing: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
          context: { ...req.context, skipIngestFileHooks: true },
        });
      } catch (updateError) {
        logger.error("Failed to update import-file status after queue failure", updateError);
      }
      return doc;
    }

    // Reconcile jobId — workflow is already running at this point.
    try {
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: String(doc.id),
        req,
        data: { jobId: queuedJobId },
        context: { ...req.context, skipIngestFileHooks: true },
      });
    } catch (error) {
      logger.error("Failed to reconcile jobId on import-files record; workflow still running", {
        ingestFileId: String(doc.id),
        jobId: queuedJobId,
        error,
      });
    }

    return doc;
  },
];
