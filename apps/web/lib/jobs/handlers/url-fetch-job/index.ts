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

import { createImportFileAndQueueDetection } from "@/lib/import/create-import-file";
import {
  fetchRemoteData,
  type FetchRemoteDataOptions,
  type FetchRemoteDataResult,
} from "@/lib/import/fetch-remote-data";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledImport, User } from "@/payload-types";

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
  result: FetchRemoteDataResult
) => {
  return {
    output: {
      success: true,
      importFileId,
      filename,
      contentHash,
      isDuplicate,
      contentType: result.mimeType,
      fileSize: result.data.length,
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

// Helper to compute fetch timeout respecting test environment
const computeTimeout = (scheduledImport: ScheduledImport | null): number => {
  const timeoutMinutes = scheduledImport?.advancedOptions?.timeoutMinutes ?? 30;
  const isTestEnv = process.env.NODE_ENV === "test";
  const configuredTestTimeout = Number(process.env.URL_FETCH_TEST_TIMEOUT_MS ?? "3000");
  const testTimeout =
    Number.isFinite(configuredTestTimeout) && configuredTestTimeout > 0 ? configuredTestTimeout : 3000;
  return isTestEnv ? testTimeout : timeoutMinutes * 60 * 1000;
};

/**
 * Builds the options for fetchRemoteData from the job input and scheduled import config.
 */
const buildFetchOptions = (
  input: UrlFetchJobInput,
  scheduledImport: ScheduledImport | null,
  cachingEnabled: boolean
): FetchRemoteDataOptions => {
  const advancedOptions = scheduledImport?.advancedOptions;

  return {
    sourceUrl: input.sourceUrl,
    authConfig: input.authConfig ?? scheduledImport?.authConfig,
    timeout: computeTimeout(scheduledImport),
    maxSize: advancedOptions?.maxFileSizeMB ? advancedOptions.maxFileSizeMB * 1024 * 1024 : undefined,
    maxRetries: scheduledImport?.retryConfig?.maxRetries ?? 3,
    cacheOptions: prepareCacheOptions(scheduledImport, input.triggeredBy, cachingEnabled),
    jsonApiConfig: advancedOptions?.jsonApiConfig as FetchRemoteDataOptions["jsonApiConfig"],
    responseFormat: (advancedOptions?.responseFormat as FetchRemoteDataOptions["responseFormat"]) ?? "auto",
  };
};

/**
 * Creates an import file record from fetched data and queues schema detection.
 */
const createImportFromFetchResult = async (
  payload: Payload,
  input: UrlFetchJobInput,
  importContext: ImportContext,
  result: FetchRemoteDataResult
): Promise<{ importFileId: string | number; filename: string }> => {
  if (!importContext.userId) {
    throw new Error("User ID is required to create import files");
  }
  const user = await loadUser(payload, importContext.userId);
  if (!user) {
    throw new Error(`User not found: ${importContext.userId}`);
  }

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const filename = `url-import-${timestamp}-${uuidv4()}${result.fileExtension}`;
  const importFileData = buildImportFileData(input.sourceUrl, result.contentHash, importContext);
  const { importFileId } = await createImportFileAndQueueDetection({
    payload,
    importFileData,
    file: { data: result.data, mimetype: result.mimeType, name: filename, size: result.data.length },
    user,
  });

  logger.info("Import file created from URL", {
    importFileId,
    filename,
    fileSize: result.data.length,
    contentType: result.mimeType,
    sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
  });

  return { importFileId, filename };
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

      // Fetch + detect file type + convert JSON to CSV (single call)
      const result = await fetchRemoteData(buildFetchOptions(input, scheduledImport, cachingEnabled));

      logger.info("URL fetch successful", {
        sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
        contentType: result.originalContentType,
        fileSize: result.data.length,
        wasConverted: result.wasConverted,
      });

      // Check for duplicate content
      const importContext = createImportContext(input, scheduledImport);
      const duplicateResult = await handleDuplicateCheck(payload, importContext, result.contentHash);
      if (duplicateResult) {
        return buildSuccessOutput(
          duplicateResult.importFileId,
          duplicateResult.filename,
          duplicateResult.contentHash,
          true,
          result
        );
      }

      // Create import file and queue schema detection
      const { importFileId, filename } = await createImportFromFetchResult(payload, input, importContext, result);

      // Update scheduled import status if applicable
      if (scheduledImport) {
        const duration = Date.now() - startTime;
        await updateScheduledImportSuccess(payload, scheduledImport, importFileId, duration);
      }

      return buildSuccessOutput(importFileId, filename, result.contentHash, false, result);
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
