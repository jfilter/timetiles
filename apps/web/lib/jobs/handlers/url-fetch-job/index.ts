/**
 * URL Fetch Job Handler.
 *
 * This job handles fetching data from URLs for URL-based and scheduled imports.
 * It downloads the data, saves it to the file system, and updates the import-files
 * record to trigger the existing dataset-detection pipeline.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";
import { v4 as uuidv4 } from "uuid";

import { COLLECTION_NAMES, JOB_TYPES } from "@/lib/constants/import-constants";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ImportFile, ScheduledImport, User } from "@/payload-types";

import { buildAuthHeaders } from "./auth";
import { calculateDataHash, detectFileTypeFromResponse, type FetchResult, fetchWithRetry } from "./fetch-utils";
import {
  checkForDuplicateContent,
  loadScheduledImportConfig,
  updateScheduledImportFailure,
  updateScheduledImportSuccess,
} from "./scheduled-import-utils";

export interface UrlFetchJobInput {
  // For scheduled imports
  scheduledImportId?: string;
  // Direct URL fetch parameters
  sourceUrl: string;
  authConfig?: ScheduledImport["authConfig"];
  catalogId?: number | string;
  originalName: string;
  userId?: number | string;
  triggeredBy?: "schedule" | "webhook" | "manual";
}

interface ImportContext {
  originalName: string;
  catalogId: string | number | undefined;
  userId: string | number | undefined;
  scheduledImportId: string | undefined;
  scheduledImport: ScheduledImport | null;
  advancedConfig: ScheduledImport["advancedOptions"];
}

type FetchSuccessResult = {
  importFileId: number | string;
  filename: string;
  contentHash: string;
  isDuplicate: boolean;
};

/**
 * Checks for duplicate content and returns early if found.
 */
const handleDuplicateCheck = async (
  payload: Payload,
  context: ImportContext,
  dataHash: string
): Promise<FetchSuccessResult | null> => {
  const { isDuplicate, existingFile } = await checkForDuplicateContent(
    payload,
    context.catalogId,
    dataHash,
    context.advancedConfig?.skipDuplicateChecking ?? false
  );

  if (!isDuplicate || !existingFile) {
    return null;
  }

  logger.info("Duplicate content detected, skipping import", {
    existingFileId: existingFile.id,
    existingFilename: existingFile.filename,
    dataHash,
  });

  if (context.scheduledImport) {
    await updateScheduledImportSuccess(payload, context.scheduledImport, existingFile.id, 0);
  }

  return { importFileId: existingFile.id, filename: existingFile.filename, contentHash: dataHash, isDuplicate: true };
};

/**
 * Builds the import file data record with all conditional fields.
 */
const buildImportFileData = (sourceUrl: string, dataHash: string, context: ImportContext): Record<string, unknown> => {
  const { originalName, catalogId, userId, scheduledImportId, scheduledImport } = context;

  const data: Record<string, unknown> = {
    originalName,
    catalog: catalogId,
    user: userId,
    status: "pending",
    metadata: {
      urlFetch: { sourceUrl, contentHash: dataHash, isDuplicate: false, fetchedAt: new Date().toISOString() },
      scheduledExecution: scheduledImportId
        ? { scheduledImportId, executionTime: new Date().toISOString() }
        : undefined,
      datasetMapping: scheduledImport?.multiSheetConfig?.enabled
        ? { enabled: true, sheets: scheduledImport.multiSheetConfig.sheets }
        : undefined,
    },
    processingOptions: {
      skipDuplicateChecking: scheduledImport?.advancedOptions?.skipDuplicateChecking ?? false,
      autoApproveSchema: scheduledImport?.advancedOptions?.autoApproveSchema ?? false,
      schemaMode: scheduledImport?.schemaMode ?? undefined,
    },
  };

  if (scheduledImportId) {
    data.scheduledImport = scheduledImportId;
  }
  if (scheduledImport?.dataset) {
    data.targetDataset = scheduledImport.dataset;
  }

  return data;
};

/**
 * Handles successful fetch and creates import file.
 */
const handleFetchSuccess = async (
  payload: Payload,
  data: Buffer,
  contentType: string,
  sourceUrl: string,
  context: ImportContext
): Promise<FetchSuccessResult> => {
  const dataHash = calculateDataHash(data);

  // Early return for duplicates
  const duplicateResult = await handleDuplicateCheck(payload, context, dataHash);
  if (duplicateResult) {
    return duplicateResult;
  }

  // Generate filename
  const { mimeType, fileExtension } = detectFileTypeFromResponse(contentType, data, sourceUrl);
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const filename = `url-import-${timestamp}-${uuidv4()}${fileExtension}`;

  // Validate and load user
  if (!context.userId) {
    throw new Error("User ID is required to create import files");
  }
  const user = await loadUser(payload, context.userId);
  if (!user) {
    throw new Error(`User not found: ${context.userId}`);
  }

  // Create import-files record
  const importFileData = buildImportFileData(sourceUrl, dataHash, context);
  const importFile = await payload.create({
    collection: COLLECTION_NAMES.IMPORT_FILES,
    data: importFileData as Omit<ImportFile, "id" | "createdAt" | "updatedAt">,
    file: { data, mimetype: mimeType, name: filename, size: data.length },
    user,
    context: { skipImportFileHooks: true },
  });

  // Queue dataset detection and update status
  const detectionJob = await payload.jobs.queue({
    task: JOB_TYPES.DATASET_DETECTION,
    input: { importFileId: importFile.id },
  });

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_FILES,
    id: importFile.id,
    data: { status: "parsing", jobId: String(detectionJob.id) },
    context: { skipImportFileHooks: true },
  });

  logger.info("Import file created from URL", {
    importFileId: importFile.id,
    filename,
    fileSize: data.length,
    contentType,
    sourceUrl: sanitizeUrlForLogging(sourceUrl),
  });

  return { importFileId: importFile.id, filename, contentHash: dataHash, isDuplicate: false };
};

const prepareFetchOptions = (scheduledImport: ScheduledImport | null) => {
  // Determine timeout from config
  const timeoutMinutes = scheduledImport?.advancedOptions?.timeoutMinutes ?? 30;
  // Use much shorter timeout in test environment (3 seconds instead of minutes)
  const isTestEnv = process.env.NODE_ENV === "test";
  const configuredTestTimeout = Number(process.env.URL_FETCH_TEST_TIMEOUT_MS ?? "3000");
  const testTimeout =
    Number.isFinite(configuredTestTimeout) && configuredTestTimeout > 0 ? configuredTestTimeout : 3000;
  const timeout = isTestEnv ? testTimeout : timeoutMinutes * 60 * 1000;

  // Determine max file size from config
  const maxFileSizeMB = scheduledImport?.advancedOptions?.maxFileSizeMB;
  const maxSize = maxFileSizeMB ? maxFileSizeMB * 1024 * 1024 : undefined;

  return { timeout, maxSize };
};

const createImportContext = (input: UrlFetchJobInput, scheduledImport: ScheduledImport | null): ImportContext => {
  // Resolve userId from input or scheduled import's creator
  const resolvedUserId = input.userId ?? extractRelationId(scheduledImport?.createdBy);

  return {
    originalName: input.originalName,
    catalogId: input.catalogId ?? extractRelationId(scheduledImport?.catalog),
    userId: resolvedUserId,
    scheduledImportId: input.scheduledImportId,
    scheduledImport,
    advancedConfig: scheduledImport?.advancedOptions,
  };
};

const buildSuccessOutput = (
  importFileId: string | number,
  filename: string,
  contentHash: string,
  isDuplicate: boolean,
  fetchResult: FetchResult
) => {
  return {
    output: {
      success: true,
      importFileId,
      filename,
      contentHash,
      isDuplicate,
      contentType: fetchResult.contentType,
      fileSize: fetchResult.contentLength,
      ...(isDuplicate && { skippedReason: "Duplicate content detected" }),
    },
  };
};

const buildErrorOutput = (error: Error) => {
  return { output: { success: false, error: error.message, errorDetails: { name: error.name, stack: error.stack } } };
};

// Helper to load user from userId (which can be object or ID)
const loadUser = async (payload: Payload, userId: string | number | User): Promise<User | null> => {
  if (typeof userId === "object") return userId;
  return payload.findByID({ collection: "users", id: userId });
};

// Helper to check and track URL fetch quota atomically
const checkAndTrackQuota = async (
  payload: Payload,
  userId: string | number | User | null | undefined,
  _scheduledImport: ScheduledImport | null
): Promise<void> => {
  if (!userId) return;

  const user = await loadUser(payload, userId);
  if (!user) return;

  // Atomic check+increment prevents TOCTOU race when concurrent jobs run
  const quotaService = createQuotaService(payload);
  await quotaService.checkAndIncrementUsage(user, "URL_FETCHES_PER_DAY", 1);
};

// Helper to prepare cache options
const prepareCacheOptions = (
  scheduledImport: ScheduledImport | null,
  triggeredBy: string | undefined,
  cachingEnabled: boolean
) => ({
  useCache: cachingEnabled && scheduledImport?.advancedOptions?.useHttpCache !== false,
  bypassCache:
    !cachingEnabled || (triggeredBy === "manual" && scheduledImport?.advancedOptions?.bypassCacheOnManual === true),
  respectCacheControl: scheduledImport?.advancedOptions?.respectCacheControl !== false,
});

// Helper to perform the fetch operation
const performFetch = async (
  input: UrlFetchJobInput,
  scheduledImport: ScheduledImport | null,
  cachingEnabled: boolean
): Promise<FetchResult> => {
  const authHeaders = buildAuthHeaders(input.authConfig ?? scheduledImport?.authConfig);
  const { timeout, maxSize } = prepareFetchOptions(scheduledImport);
  const cacheOptions = prepareCacheOptions(scheduledImport, input.triggeredBy, cachingEnabled);

  return fetchWithRetry(input.sourceUrl, {
    authHeaders,
    timeout,
    maxSize,
    retryConfig: scheduledImport?.retryConfig,
    cacheOptions,
    userId: input.userId ? String(input.userId) : undefined,
  });
};

export const urlFetchJob = {
  slug: "url-fetch",
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as UrlFetchJobInput;

    const startTime = Date.now();
    logger.info("Starting URL fetch job", {
      sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
      scheduledImportId: input.scheduledImportId,
    });

    if (!input.sourceUrl) {
      throw new Error("Source URL is required");
    }

    let scheduledImport: ScheduledImport | null = null;

    try {
      scheduledImport = await loadScheduledImportConfig(payload, input.scheduledImportId);

      // Abort if scheduled import was requested but is disabled or not found
      if (input.scheduledImportId && !scheduledImport) {
        logger.info("Scheduled import disabled or not found, aborting", { scheduledImportId: input.scheduledImportId });
        return { output: { success: false, error: "Scheduled import is disabled or not found" } };
      }

      // Resolve userId from input or scheduled import's creator
      const resolvedUserId = input.userId ?? extractRelationId(scheduledImport?.createdBy);

      // Check and track quota (handles undefined userId gracefully)
      await checkAndTrackQuota(payload, resolvedUserId, scheduledImport);

      // Check if URL fetch caching is enabled
      const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
      const cachingEnabled = await isFeatureEnabled(payload, "enableUrlFetchCaching");

      // Perform fetch
      const fetchResult = await performFetch(input, scheduledImport, cachingEnabled);

      logger.info("URL fetch successful", {
        sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
        contentType: fetchResult.contentType,
        contentLength: fetchResult.contentLength,
        attempts: fetchResult.attempts,
      });

      // Handle successful fetch
      const importContext = createImportContext(input, scheduledImport);
      const { importFileId, filename, contentHash, isDuplicate } = await handleFetchSuccess(
        payload,
        fetchResult.data,
        fetchResult.contentType,
        input.sourceUrl,
        importContext
      );

      // Update scheduled import status if applicable
      if (scheduledImport) {
        const duration = Date.now() - startTime;
        await updateScheduledImportSuccess(payload, scheduledImport, importFileId, duration);
      }

      return buildSuccessOutput(importFileId, filename, contentHash, isDuplicate, fetchResult);
    } catch (error) {
      const errorObj = error as Error;
      logError(errorObj, "URL fetch job failed", {
        sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
        scheduledImportId: input.scheduledImportId,
      });

      if (scheduledImport) {
        await updateScheduledImportFailure(payload, scheduledImport, errorObj);
      }

      return buildErrorOutput(errorObj);
    }
  },
};
