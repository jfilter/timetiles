import config from "@payload-config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { v4 as uuidv4 } from "uuid";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createRequestLogger, logError } from "@/lib/logger";
import { getRateLimitService, getClientIdentifier, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import type { Import } from "@/payload-types";

// Use Payload types directly instead of custom interfaces
type ProgressResponse = {
  importId: string;
  status: Import["status"];
  stage: Import["processingStage"];
  progress: {
    current: number;
    total: number;
    percentage: number;
    createdEvents: number;
  };
  stageProgress: {
    stage: string;
    percentage: number;
  };
  batchInfo: {
    currentBatch: number;
    totalBatches: number;
    batchSize: number;
  };
  geocodingStats: Import["geocodingStats"];
  currentJob?: {
    id: string;
    status: string;
    progress: number;
  };
  estimatedTimeRemaining?: number;
};

// Use Payload's progress type structure but simplified for calculations
type ProgressCounts = {
  totalRows: number;
  processedRows: number;
  geocodedRows: number;
  createdEvents: number;
};

// Use the generated Import type instead of custom interface

export async function GET(request: NextRequest, { params }: { params: Promise<{ importId: string }> }) {
  const requestId = uuidv4();
  const logger = createRequestLogger(requestId);

  try {
    logger.debug("Handling progress check request");
    const payload = await getPayload({ config });
    const resolvedParams = await params;
    const importId = resolvedParams.importId;

    const { clientId, rateLimitService } = setupRateLimit(request, payload);
    const importResult = await fetchImportRecord(payload, importId);
    if ("error" in importResult) {
      return importResult.error;
    }
    const importRecord = importResult;
    const progressCounts = extractProgressCounts(importRecord);
    const stageProgress = calculateStageProgress(
      importRecord.processingStage ?? PROCESSING_STAGE.FILE_PARSING,
      progressCounts,
    );
    const currentJobStatus = getCurrentJobStatus(importRecord, stageProgress, logger);
    const response = buildProgressResponse(importRecord, importId, progressCounts, stageProgress, currentJobStatus);
    const headers = rateLimitService.getRateLimitHeaders(clientId, RATE_LIMITS.PROGRESS_CHECK.limit);

    logger.debug({ importId, status: response.status, stage: response.stage }, "Progress check completed");
    return NextResponse.json(response, { headers });
  } catch (error) {
    logError(error, "Progress tracking error", { requestId });
    return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 });
  }
}

function setupRateLimit(request: NextRequest, payload: Awaited<ReturnType<typeof getPayload>>) {
  const clientId = getClientIdentifier(request);
  const rateLimitService = getRateLimitService(payload);
  return { clientId, rateLimitService };
}

async function fetchImportRecord(
  payload: Awaited<ReturnType<typeof getPayload>>,
  importId: string,
): Promise<Import | { error: NextResponse }> {
  try {
    return await payload.findByID({
      collection: "imports",
      id: importId,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Not Found") || error.name === "NotFound")) {
      return { error: NextResponse.json({ error: "Import not found" }, { status: 404 }) };
    }
    throw error;
  }
}

function extractProgressCounts(importRecord: Import): ProgressCounts {
  return {
    totalRows: importRecord.progress?.totalRows ?? 0,
    processedRows: importRecord.progress?.processedRows ?? 0,
    geocodedRows: importRecord.progress?.geocodedRows ?? 0,
    createdEvents: importRecord.progress?.createdEvents ?? 0,
  };
}

function getCurrentJobStatus(
  importRecord: Import,
  stageProgress: { stage: string; percentage: number },
  logger: ReturnType<typeof createRequestLogger>,
): { id: string; status: string; progress: number } | null {
  if (importRecord.currentJobId == null) {
    return null;
  }

  try {
    return {
      id: importRecord.currentJobId,
      status: "running",
      progress: stageProgress.percentage,
    };
  } catch (error) {
    logger.warn({ error, importId: importRecord.id, jobId: importRecord.currentJobId }, "Failed to get job status");
    return null;
  }
}

function buildProgressResponse(
  importRecord: Import,
  importId: string,
  progressCounts: ProgressCounts,
  stageProgress: { stage: string; percentage: number },
  currentJobStatus: { id: string; status: string; progress: number } | null,
): ProgressResponse {
  return {
    importId,
    status: importRecord.status ?? "pending",
    stage: importRecord.processingStage ?? PROCESSING_STAGE.FILE_PARSING,
    progress: {
      current: progressCounts.processedRows,
      total: progressCounts.totalRows,
      percentage:
        progressCounts.totalRows > 0 ? Math.round((progressCounts.processedRows / progressCounts.totalRows) * 100) : 0,
      createdEvents: progressCounts.createdEvents,
    },
    stageProgress,
    batchInfo: {
      currentBatch: Number(importRecord.batchInfo?.currentBatch ?? 0),
      totalBatches: Number(importRecord.batchInfo?.totalBatches ?? 0),
      batchSize: Number(importRecord.batchInfo?.batchSize ?? 100),
    },
    geocodingStats: importRecord.geocodingStats ?? {},
    currentJob: currentJobStatus ?? undefined,
    estimatedTimeRemaining: calculateEstimatedTime(importRecord),
  };
}

function calculateStageProgress(stage: Import["processingStage"], counts: ProgressCounts) {
  switch (stage) {
    case PROCESSING_STAGE.FILE_PARSING:
      return { stage: "Parsing file...", percentage: 10 };
    case "row-processing":
      return {
        stage: "Processing rows...",
        percentage: 10 + (counts.processedRows / counts.totalRows) * 40,
      };
    case "geocoding":
      return {
        stage: "Geocoding addresses...",
        percentage: 50 + (counts.geocodedRows / counts.totalRows) * 30,
      };
    case "event-creation":
      return {
        stage: "Creating events...",
        percentage: 80 + (counts.createdEvents / counts.totalRows) * 20,
      };
    case "completed":
      return { stage: "Completed", percentage: 100 };
    default:
      return { stage: "Processing...", percentage: 0 };
  }
}

function calculateEstimatedTime(importRecord: Import): number | undefined {
  // Simple estimation based on processing speed
  const totalRows = importRecord.progress?.totalRows ?? 0;
  const processedRows = importRecord.progress?.processedRows ?? 0;
  const remainingRows = totalRows - processedRows;

  if (remainingRows <= 0 || importRecord.importedAt == null) {
    return undefined;
  }

  const startTime = new Date(importRecord.importedAt).getTime();
  const currentTime = Date.now();
  const elapsedTime = currentTime - startTime;

  if (processedRows === 0 || elapsedTime === 0) {
    return undefined;
  }

  const processingRate = processedRows / (elapsedTime / 1000); // rows per second
  const estimatedSeconds = remainingRows / processingRate;

  return Math.round(estimatedSeconds);
}
