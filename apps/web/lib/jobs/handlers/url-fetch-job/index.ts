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
import { createIngestFile } from "@/lib/ingest/create-ingest-file";
import {
  fetchRemoteData,
  type FetchRemoteDataOptions,
  type FetchRemoteDataResult,
} from "@/lib/ingest/fetch-remote-data";
import type { PreProcessingConfig } from "@/lib/ingest/pre-process-records";
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
  /** When true, the parent workflow owns scheduled-ingest success/failure updates. */
  deferLifecycleUpdates?: boolean;
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

  return { ingestFileId: existingFile.id, filename: existingFile.filename, contentHash: dataHash, isDuplicate: true };
};

/** Build the dataset mapping metadata for the ingest file from a scheduled ingest. */
const buildDatasetMapping = (
  scheduledIngest: ScheduledIngest | null
): { mappingType: string; singleDataset?: unknown; sheetMappings?: unknown[] } | undefined => {
  if (scheduledIngest?.multiSheetConfig?.enabled) {
    return { mappingType: "multiple", sheetMappings: scheduledIngest.multiSheetConfig.sheets ?? [] };
  }
  if (scheduledIngest?.dataset) {
    return { mappingType: "single", singleDataset: extractRelationId(scheduledIngest.dataset) };
  }
  return undefined;
};

/**
 * Builds the import file data record with all conditional fields.
 */
const buildImportFileData = (sourceUrl: string, dataHash: string, context: ImportContext): Record<string, unknown> => {
  const { originalName, catalogId, userId, scheduledIngestId, scheduledIngest } = context;

  // catalogId/userId may arrive as strings from workflow input schemas — coerce to numbers
  const numericCatalogId = typeof catalogId === "string" ? Number(catalogId) : catalogId;
  const numericUserId = typeof userId === "string" ? Number(userId) : userId;

  const advancedOpts = scheduledIngest?.advancedOptions;

  const data: Record<string, unknown> = {
    originalName,
    catalog: numericCatalogId ?? undefined,
    user: numericUserId ?? undefined,
    status: "pending",
    metadata: {
      urlFetch: { sourceUrl, contentHash: dataHash, isDuplicate: false, fetchedAt: new Date().toISOString() },
      scheduledExecution: scheduledIngestId
        ? { scheduledIngestId, executionTime: new Date().toISOString() }
        : undefined,
      datasetMapping: buildDatasetMapping(scheduledIngest),
    },
    processingOptions: {
      skipDuplicateChecking: advancedOpts?.skipDuplicateChecking ?? false,
      autoApproveSchema: advancedOpts?.autoApproveSchema ?? false,
      schemaMode: scheduledIngest?.schemaMode ?? undefined,
      reviewChecks: advancedOpts?.reviewChecks,
      geocodingBias: advancedOpts?.geocodingBias,
    },
  };

  if (scheduledIngestId) {
    data.scheduledIngest = scheduledIngestId;
  }
  const targetDatasetId = extractRelationId(scheduledIngest?.dataset);
  if (targetDatasetId != null) {
    data.targetDataset = targetDatasetId;
  }

  return data;
};

const createImportContext = (input: UrlFetchJobInput, scheduledIngest: ScheduledIngest | null): ImportContext => {
  return {
    originalName: input.originalName,
    catalogId: input.catalogId,
    userId: input.userId,
    scheduledIngestId: input.scheduledIngestId,
    scheduledIngest,
    advancedConfig: scheduledIngest?.advancedOptions,
  };
};

const createEffectiveInput = (input: UrlFetchJobInput, scheduledIngest: ScheduledIngest | null): UrlFetchJobInput => {
  if (!scheduledIngest) return input;

  return {
    ...input,
    sourceUrl: scheduledIngest.sourceUrl ?? input.sourceUrl,
    authConfig: scheduledIngest.authConfig ?? input.authConfig,
    catalogId: extractRelationId(scheduledIngest.catalog) ?? input.catalogId,
    userId: extractRelationId(scheduledIngest.createdBy) ?? input.userId,
  };
};

const isPrivilegedJobUser = (user: User | null | undefined): boolean =>
  user?.role === "admin" || user?.role === "editor";

const assertScheduledIngestInputMatches = (
  input: UrlFetchJobInput,
  scheduledIngest: ScheduledIngest | null,
  requestUser: User | null | undefined
): void => {
  if (!scheduledIngest) return;

  const expectedUserId = extractRelationId(scheduledIngest.createdBy);

  if (expectedUserId == null) return;

  if (input.userId != null && String(input.userId) !== String(expectedUserId)) {
    throw new Error("URL fetch input user does not own scheduled ingest");
  }

  if (requestUser && !isPrivilegedJobUser(requestUser) && String(requestUser.id) !== String(expectedUserId)) {
    throw new Error("URL fetch request user does not own scheduled ingest");
  }
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
    cachingEnabled && triggeredBy === "manual" && scheduledIngest?.advancedOptions?.bypassCacheOnManual === true,
  respectCacheControl: scheduledIngest?.advancedOptions?.respectCacheControl !== false,
});

// Helper to compute fetch timeout respecting test environment.
//
// URL_FETCH_TEST_TIMEOUT_MS is read directly from process.env (NOT via getEnv)
// because tests mutate it per-assertion and getEnv() is memoized. See the
// comment in lib/config/env.ts for why this one variable is an exception to
// the "all env goes through getEnv()" rule.
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
    authConfig: scheduledIngest?.authConfig ?? input.authConfig,
    timeout: computeTimeout(scheduledIngest),
    maxSize: advancedOptions?.maxFileSizeMB ? advancedOptions.maxFileSizeMB * 1024 * 1024 : undefined,
    maxRetries: scheduledIngest?.retryConfig?.maxRetries ?? 3,
    cacheOptions: prepareCacheOptions(scheduledIngest, input.triggeredBy, cachingEnabled),
    jsonApiConfig: advancedOptions?.jsonApiConfig as FetchRemoteDataOptions["jsonApiConfig"],
    excludeFields: Array.isArray(scheduledIngest?.excludeFields)
      ? (scheduledIngest.excludeFields as string[])
      : undefined,
    preProcessing: (() => {
      const pp = scheduledIngest?.preProcessing as
        | { groupBy?: string | null; mergeFields?: unknown; extractFields?: unknown }
        | null
        | undefined;
      if (!pp?.groupBy && !pp?.extractFields) return undefined;
      return {
        groupBy: pp.groupBy ?? undefined,
        mergeFields: (pp.mergeFields as Record<string, "min" | "max">) ?? undefined,
        extractFields: (pp.extractFields as PreProcessingConfig["extractFields"]) ?? undefined,
      };
    })(),
    responseFormat: (advancedOptions?.responseFormat as FetchRemoteDataOptions["responseFormat"]) ?? "auto",
    htmlExtractConfig: advancedOptions?.htmlExtractConfig as FetchRemoteDataOptions["htmlExtractConfig"],
    isFirstRun: (scheduledIngest?.statistics?.successfulRuns ?? 0) === 0,
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
  const { ingestFileId } = await createIngestFile({
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
  concurrency: () => "ingest-pipeline",
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as UrlFetchJobInput;
    const deferLifecycleUpdates = input.deferLifecycleUpdates === true;

    const startTime = Date.now();
    logger.info("Starting URL fetch job", {
      sourceUrl: sanitizeUrlForLogging(input.sourceUrl),
      scheduledIngestId: input.scheduledIngestId,
    });

    if (!input.sourceUrl) {
      throw new Error("Source URL is required");
    }

    // Load scheduled ingest config before try block — disabled/not-found is expected
    // behavior that should not be logged as an error
    const scheduledIngest = await loadScheduledIngestConfig(payload, input.scheduledIngestId);
    if (input.scheduledIngestId && !scheduledIngest) {
      logger.info("Scheduled ingest disabled or not found, aborting", { scheduledIngestId: input.scheduledIngestId });
      throw new Error("scheduled ingest is disabled or not found");
    }
    const effectiveInput = createEffectiveInput(input, scheduledIngest);

    try {
      assertScheduledIngestInputMatches(input, scheduledIngest, context.req.user as User | null | undefined);

      const resolvedUserId = effectiveInput.userId;

      // Check and track quota (handles undefined userId gracefully)
      await checkAndTrackQuota(payload, resolvedUserId, scheduledIngest);

      // Check if URL fetch caching is enabled
      const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
      const cachingEnabled = await getFeatureFlagService(payload).isEnabled("enableUrlFetchCaching");

      // Fetch + detect file type + convert JSON to CSV (single call)
      const result = await fetchRemoteData(buildFetchOptions(effectiveInput, scheduledIngest, cachingEnabled));

      logger.info("URL fetch successful", {
        sourceUrl: sanitizeUrlForLogging(effectiveInput.sourceUrl),
        contentType: result.originalContentType,
        fileSize: result.data.length,
        wasConverted: result.wasConverted,
      });

      // Check for duplicate content
      const importContext = createImportContext(effectiveInput, scheduledIngest);
      const duplicateResult = await handleDuplicateCheck(payload, importContext, result.contentHash);
      if (duplicateResult) {
        if (scheduledIngest && !deferLifecycleUpdates) {
          const duration = Date.now() - startTime;
          await updateScheduledIngestSuccess(payload, scheduledIngest, duplicateResult.ingestFileId, duration);
        }
        return buildSuccessOutput(
          duplicateResult.ingestFileId,
          duplicateResult.filename,
          duplicateResult.contentHash,
          true,
          result
        );
      }

      // Create import file and queue schema detection
      const { ingestFileId, filename } = await createImportFromFetchResult(
        payload,
        effectiveInput,
        importContext,
        result
      );

      // Update scheduled ingest status if applicable
      if (scheduledIngest && !deferLifecycleUpdates) {
        const duration = Date.now() - startTime;
        await updateScheduledIngestSuccess(payload, scheduledIngest, ingestFileId, duration);
      }

      return buildSuccessOutput(ingestFileId, filename, result.contentHash, false, result);
    } catch (error) {
      const errorObj = error as Error;
      logError(errorObj, "URL fetch job failed", {
        sourceUrl: sanitizeUrlForLogging(effectiveInput.sourceUrl),
        scheduledIngestId: input.scheduledIngestId,
      });

      if (scheduledIngest && !deferLifecycleUpdates) {
        // JobHandlerContext.req is narrowly typed as { payload, user }, but it
        // is in fact a PayloadRequest — carrying transactionID and context that
        // the audit/update paths need. Cast through unknown to let Payload pick
        // up the transaction if one is active.
        await updateScheduledIngestFailure(
          payload,
          scheduledIngest,
          errorObj,
          context.req as unknown as { transactionID?: number | string; context?: Record<string, unknown> }
        );
      }

      // Throw — Payload marks workflow as failed
      throw error;
    }
  },
};
