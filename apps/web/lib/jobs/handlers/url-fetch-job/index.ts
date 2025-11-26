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
import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";
import type { ScheduledImport, User } from "@/payload-types";

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

/**
 * Handles successful fetch and creates import file.
 */
/* eslint-disable sonarjs/max-lines-per-function, complexity -- Complex import file creation logic */
const handleFetchSuccess = async (
  payload: Payload,
  data: Buffer,
  contentType: string,
  sourceUrl: string,
  context: ImportContext
): Promise<{ importFileId: number | string; filename: string; contentHash: string; isDuplicate: boolean }> => {
  const { originalName, catalogId, userId, scheduledImportId, scheduledImport, advancedConfig } = context;

  // Calculate hash for duplicate checking
  const dataHash = calculateDataHash(data);

  // Check for duplicate content
  const { isDuplicate, existingFile } = await checkForDuplicateContent(
    payload,
    catalogId,
    dataHash,
    advancedConfig?.skipDuplicateChecking ?? false
  );

  if (isDuplicate && existingFile) {
    logger.info("Duplicate content detected, skipping import", {
      existingFileId: existingFile.id,
      existingFilename: existingFile.filename,
      dataHash,
    });

    // Still update scheduled import as successful
    if (scheduledImport) {
      await updateScheduledImportSuccess(payload, scheduledImport, existingFile.id, 0);
    }

    return {
      importFileId: existingFile.id,
      filename: existingFile.filename,
      contentHash: dataHash,
      isDuplicate: true,
    };
  }

  // Generate filename with extension
  const { mimeType, fileExtension } = detectFileTypeFromResponse(contentType, data, sourceUrl);
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const filename = `url-import-${timestamp}-${uuidv4()}${fileExtension}`;

  // Validate user - required for all imports
  if (!userId) {
    throw new Error("User ID is required to create import files");
  }

  // Load the full user object for the create operation
  const user = await loadUser(payload, userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Create import-files record with file upload
  const importFileData: Record<string, unknown> = {
    originalName,
    catalog: catalogId,
    user: userId,
    status: "pending",
    metadata: {
      urlFetch: {
        sourceUrl,
        contentHash: dataHash,
        isDuplicate: false,
        fetchedAt: new Date().toISOString(),
      },
      scheduledExecution: scheduledImportId
        ? {
            scheduledImportId,
            executionTime: new Date().toISOString(),
          }
        : undefined,
      datasetMapping: scheduledImport?.multiSheetConfig?.enabled
        ? {
            enabled: true,
            sheets: scheduledImport.multiSheetConfig.sheets,
          }
        : undefined,
    },
    processingOptions: {
      skipDuplicateChecking: scheduledImport?.advancedOptions?.skipDuplicateChecking ?? false,
      autoApproveSchema: scheduledImport?.advancedOptions?.autoApproveSchema ?? false,
    },
  };

  if (scheduledImportId) {
    importFileData.scheduledImport = scheduledImportId;
  }

  if (scheduledImport?.dataset) {
    importFileData.targetDataset = scheduledImport.dataset;
  }

  const importFile = await payload.create({
    collection: COLLECTION_NAMES.IMPORT_FILES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic data building
    data: importFileData as any,
    file: {
      data,
      mimetype: mimeType,
      name: filename,
      size: data.length,
    },
    // Pass user context for proper access control and audit trail
    user,
  });

  // Queue dataset detection job
  await payload.jobs.queue({
    task: JOB_TYPES.DATASET_DETECTION,
    input: {
      importFileId: importFile.id,
    },
  });

  logger.info("Import file created from URL", {
    importFileId: importFile.id,
    filename,
    fileSize: data.length,
    contentType,
    sourceUrl,
  });

  return {
    importFileId: importFile.id,
    filename,
    contentHash: dataHash,
    isDuplicate: false,
  };
};
/* eslint-enable sonarjs/max-lines-per-function */

const prepareFetchOptions = (scheduledImport: ScheduledImport | null) => {
  // Determine timeout from config
  const timeoutMinutes = scheduledImport?.advancedOptions?.timeoutMinutes ?? 30;
  // Use much shorter timeout in test environment (3 seconds instead of minutes)
  const isTestEnv = process.env.NODE_ENV === "test";
  const timeout = isTestEnv ? 3000 : timeoutMinutes * 60 * 1000;

  // Determine max file size from config
  const maxFileSizeMB = scheduledImport?.advancedOptions?.maxFileSizeMB;
  const maxSize = maxFileSizeMB ? maxFileSizeMB * 1024 * 1024 : undefined;

  return { timeout, maxSize };
};

const createImportContext = (input: UrlFetchJobInput, scheduledImport: ScheduledImport | null): ImportContext => {
  // Resolve userId from input or scheduled import's creator
  const createdBy = scheduledImport?.createdBy;
  const resolvedUserId = input.userId ?? (typeof createdBy === "object" ? createdBy?.id : createdBy);

  return {
    originalName: input.originalName,
    catalogId:
      input.catalogId ??
      (typeof scheduledImport?.catalog === "object" ? scheduledImport.catalog.id : scheduledImport?.catalog),
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
  return {
    output: {
      success: false,
      error: error.message,
      errorDetails: {
        name: error.name,
        stack: error.stack,
      },
    },
  };
};

// Helper to load user from userId (which can be object or ID)
const loadUser = async (payload: Payload, userId: string | number | User): Promise<User | null> => {
  if (typeof userId === "object") return userId;
  return payload.findByID({ collection: "users", id: userId });
};

// Helper to check and track URL fetch quota
const checkAndTrackQuota = async (
  payload: Payload,
  userId: string | number | User | null | undefined,
  scheduledImport: ScheduledImport | null
): Promise<void> => {
  if (!userId) return;

  const user = await loadUser(payload, userId);
  if (!user) return;

  const quotaService = getQuotaService(payload);
  const quotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.URL_FETCHES_PER_DAY, 1);

  if (!quotaCheck.allowed) {
    const errorMessage = `Daily URL fetch limit reached (${quotaCheck.current}/${quotaCheck.limit}). Resets at midnight UTC.`;

    if (scheduledImport) {
      await updateScheduledImportFailure(payload, scheduledImport, new Error(errorMessage));
    }

    throw new Error(errorMessage);
  }

  // Track URL fetch usage
  await quotaService.incrementUsage(user.id, USAGE_TYPES.URL_FETCHES_TODAY, 1);

  logger.info("URL fetch quota checked and tracked", {
    userId: user.id,
    remaining: quotaCheck.remaining,
  });
};

// Helper to prepare cache options
const prepareCacheOptions = (scheduledImport: ScheduledImport | null, triggeredBy: string | undefined) => ({
  useCache: scheduledImport?.advancedOptions?.useHttpCache !== false,
  bypassCache: triggeredBy === "manual" && scheduledImport?.advancedOptions?.bypassCacheOnManual === true,
  respectCacheControl: scheduledImport?.advancedOptions?.respectCacheControl !== false,
});

// Helper to perform the fetch operation
const performFetch = async (input: UrlFetchJobInput, scheduledImport: ScheduledImport | null): Promise<FetchResult> => {
  const authHeaders = buildAuthHeaders(input.authConfig ?? scheduledImport?.authConfig);
  const { timeout, maxSize } = prepareFetchOptions(scheduledImport);
  const cacheOptions = prepareCacheOptions(scheduledImport, input.triggeredBy);

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
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as UrlFetchJobInput;

    const startTime = Date.now();
    logger.info("Starting URL fetch job", {
      sourceUrl: input.sourceUrl,
      scheduledImportId: input.scheduledImportId,
    });

    if (!input.sourceUrl) {
      throw new Error("Source URL is required");
    }

    let scheduledImport: ScheduledImport | null = null;

    try {
      scheduledImport = await loadScheduledImportConfig(payload, input.scheduledImportId);

      // Resolve userId from input or scheduled import's creator
      const createdBy = scheduledImport?.createdBy;
      const resolvedUserId = input.userId ?? (typeof createdBy === "object" ? createdBy?.id : createdBy);

      // Check and track quota (handles undefined userId gracefully)
      await checkAndTrackQuota(payload, resolvedUserId, scheduledImport);

      // Perform fetch
      const fetchResult = await performFetch(input, scheduledImport);

      logger.info("URL fetch successful", {
        sourceUrl: input.sourceUrl,
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
        sourceUrl: input.sourceUrl,
        scheduledImportId: input.scheduledImportId,
      });

      if (scheduledImport) {
        await updateScheduledImportFailure(payload, scheduledImport, errorObj);
      }

      return buildErrorOutput(errorObj);
    }
  },
};
