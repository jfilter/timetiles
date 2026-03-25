/**
 * URL Fetch Job Handler.
 *
 * This job handles fetching data from URLs for URL-based and scheduled ingests.
 * It downloads the data, saves it to the file system, and updates the import-files
 * record to trigger the existing dataset-detection pipeline.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";
import { v4 as uuidv4 } from "uuid";

import { getEnv } from "@/lib/config/env";
import { createIngestFileAndQueueDetection } from "@/lib/ingest/create-ingest-file";
import {
  fetchRemoteData,
  type FetchRemoteDataOptions,
  type FetchRemoteDataResult,
} from "@/lib/ingest/fetch-remote-data";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledIngest, User } from "@/payload-types";

import {
  checkForDuplicateContent,
  loadScheduledIngestConfig,
  updateScheduledIngestFailure,
  updateScheduledIngestSuccess,
} from "./scheduled-ingest-utils";

export interface UrlFetchJobInput {
  // For scheduled ingests
  scheduledIngestId?: number;
  // Direct URL fetch parameters
  sourceUrl: string;
  authConfig?: ScheduledIngest["authConfig"];
  catalogId?: number | string;
  originalName: string;
  userId?: number | string;
  triggeredBy?: "schedule" | "webhook" | "manual";
}

interface ImportContext {
  originalName: string;
  catalogId: string | number | undefined;
  userId: string | number | undefined;
  scheduledIngestId: number | undefined;
  scheduledIngest: ScheduledIngest | null;
  advancedConfig: ScheduledIngest["advancedOptions"];
}

type FetchSuccessResult = {
  ingestFileId: number | string;
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

  if (context.scheduledIngest) {
    await updateScheduledIngestSuccess(payload, context.scheduledIngest, existingFile.id, 0);
  }

  return { ingestFileId: existingFile.id, filename: existingFile.filename, contentHash: dataHash, isDuplicate: true };
};

/**
 * Builds the import file data record with all conditional fields.
 */
const buildImportFileData = (sourceUrl: string, dataHash: string, context: ImportContext): Record<string, unknown> => {
  const { originalName, catalogId, userId, scheduledIngestId, scheduledIngest } = context;

  const data: Record<string, unknown> = {
    originalName,
    catalog: catalogId,
    user: userId,
    status: "pending",
    metadata: {
      urlFetch: { sourceUrl, contentHash: dataHash, isDuplicate: false, fetchedAt: new Date().toISOString() },
      scheduledExecution: scheduledIngestId
        ? { scheduledIngestId, executionTime: new Date().toISOString() }
        : undefined,
      datasetMapping: scheduledIngest?.multiSheetConfig?.enabled
        ? { enabled: true, sheets: scheduledIngest.multiSheetConfig.sheets }
        : undefined,
    },
    processingOptions: {
      skipDuplicateChecking: scheduledIngest?.advancedOptions?.skipDuplicateChecking ?? false,
      autoApproveSchema: scheduledIngest?.advancedOptions?.autoApproveSchema ?? false,
      schemaMode: scheduledIngest?.schemaMode ?? undefined,
      reviewChecks: scheduledIngest?.advancedOptions?.reviewChecks ?? undefined,
    },
  };

  if (scheduledIngestId) {
    data.scheduledIngest = scheduledIngestId;
  }
  if (scheduledIngest?.dataset) {
    data.targetDataset = scheduledIngest.dataset;
  }

  return data;
};

const createImportContext = (input: UrlFetchJobInput, scheduledIngest: ScheduledIngest | null): ImportContext => {
  // Resolve userId from input or scheduled ingest's creator
  const resolvedUserId = input.userId ?? extractRelationId(scheduledIngest?.createdBy);

  return {
    originalName: input.originalName,
    catalogId: input.catalogId ?? extractRelationId(scheduledIngest?.catalog),
    userId: resolvedUserId,
    scheduledIngestId: input.scheduledIngestId,
    scheduledIngest,
    advancedConfig: scheduledIngest?.advancedOptions,
  };
};

const buildSuccessOutput = (
  ingestFileId: string | number,
  filename: string,
  contentHash: string,
  isDuplicate: boolean,
  result: FetchRemoteDataResult
) => {
  return {
    output: {
      ingestFileId,
      filename,
      contentHash,
      isDuplicate,
      contentType: result.mimeType,
      fileSize: result.data.length,
      ...(isDuplicate && { skippedReason: "Duplicate content detected" }),
    },
  };
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
  _scheduledImport: ScheduledIngest | null
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
  scheduledIngest: ScheduledIngest | null,
  triggeredBy: string | undefined,
  cachingEnabled: boolean
) => ({
  useCache: cachingEnabled && scheduledIngest?.advancedOptions?.useHttpCache !== false,
  bypassCache:
    !cachingEnabled || (triggeredBy === "manual" && scheduledIngest?.advancedOptions?.bypassCacheOnManual === true),
  respectCacheControl: scheduledIngest?.advancedOptions?.respectCacheControl !== false,
});

// Helper to compute fetch timeout respecting test environment
const computeTimeout = (scheduledIngest: ScheduledIngest | null): number => {
  const timeoutMinutes = scheduledIngest?.advancedOptions?.timeoutMinutes ?? 30;
  const isTestEnv = getEnv().NODE_ENV === "test";
  const configuredTestTimeout = Number(process.env.URL_FETCH_TEST_TIMEOUT_MS ?? "3000");
  const testTimeout =
    Number.isFinite(configuredTestTimeout) && configuredTestTimeout > 0 ? configuredTestTimeout : 3000;
  return isTestEnv ? testTimeout : timeoutMinutes * 60 * 1000;
};

/**
 * Builds the options for fetchRemoteData from the job input and scheduled ingest config.
 */
const buildFetchOptions = (
  input: UrlFetchJobInput,
  scheduledIngest: ScheduledIngest | null,
  cachingEnabled: boolean
): FetchRemoteDataOptions => {
  const advancedOptions = scheduledIngest?.advancedOptions;

  return {
    sourceUrl: input.sourceUrl,
    authConfig: input.authConfig ?? scheduledIngest?.authConfig,
    timeout: computeTimeout(scheduledIngest),
    maxSize: advancedOptions?.maxFileSizeMB ? advancedOptions.maxFileSizeMB * 1024 * 1024 : undefined,
    maxRetries: scheduledIngest?.retryConfig?.maxRetries ?? 3,
    cacheOptions: prepareCacheOptions(scheduledIngest, input.triggeredBy, cachingEnabled),
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
): Promise<{ ingestFileId: string | number; filename: string }> => {
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
  const { ingestFileId } = await createIngestFileAndQueueDetection({
    payload,
    importFileData,
    file: { data: result.data, mimetype: result.mimeType, name: filename, size: result.data.length },
    user,
  });

  logger.info("Import file created from URL", {
    ingestFileId,
    filename,
    fileSize: result.data.length,
    contentType: result.mimeType,
    sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
  });

  return { ingestFileId, filename };
};

export const urlFetchJob = {
  slug: "url-fetch",
  queue: "ingest" as const,
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as UrlFetchJobInput;

    const startTime = Date.now();
    logger.info("Starting URL fetch job", {
      sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
      scheduledIngestId: input.scheduledIngestId,
    });

    if (!input.sourceUrl) {
      throw new Error("Source URL is required");
    }

    let scheduledIngest: ScheduledIngest | null = null;

    try {
      scheduledIngest = await loadScheduledIngestConfig(payload, input.scheduledIngestId);

      // Abort if scheduled ingest was requested but is disabled or not found
      if (input.scheduledIngestId && !scheduledIngest) {
        logger.info("scheduled ingest disabled or not found, aborting", { scheduledIngestId: input.scheduledIngestId });
        throw new Error("scheduled ingest is disabled or not found");
      }

      // Resolve userId from input or scheduled ingest's creator
      const resolvedUserId = input.userId ?? extractRelationId(scheduledIngest?.createdBy);

      // Check and track quota (handles undefined userId gracefully)
      await checkAndTrackQuota(payload, resolvedUserId, scheduledIngest);

      // Check if URL fetch caching is enabled
      const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
      const cachingEnabled = await getFeatureFlagService(payload).isEnabled("enableUrlFetchCaching");

      // Fetch + detect file type + convert JSON to CSV (single call)
      const result = await fetchRemoteData(buildFetchOptions(input, scheduledIngest, cachingEnabled));

      logger.info("URL fetch successful", {
        sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
        contentType: result.originalContentType,
        fileSize: result.data.length,
        wasConverted: result.wasConverted,
      });

      // Check for duplicate content
      const importContext = createImportContext(input, scheduledIngest);
      const duplicateResult = await handleDuplicateCheck(payload, importContext, result.contentHash);
      if (duplicateResult) {
        return buildSuccessOutput(
          duplicateResult.ingestFileId,
          duplicateResult.filename,
          duplicateResult.contentHash,
          true,
          result
        );
      }

      // Create import file and queue schema detection
      const { ingestFileId, filename } = await createImportFromFetchResult(payload, input, importContext, result);

      // Update scheduled ingest status if applicable
      if (scheduledIngest) {
        const duration = Date.now() - startTime;
        await updateScheduledIngestSuccess(payload, scheduledIngest, ingestFileId, duration);
      }

      return buildSuccessOutput(ingestFileId, filename, result.contentHash, false, result);
    } catch (error) {
      const errorObj = error as Error;
      logError(errorObj, "URL fetch job failed", {
        sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
        scheduledIngestId: input.scheduledIngestId,
      });

      if (scheduledIngest) {
        await updateScheduledIngestFailure(payload, scheduledIngest, errorObj);
      }

      // Throw — Payload marks workflow as failed
      throw error;
    }
  },
};
