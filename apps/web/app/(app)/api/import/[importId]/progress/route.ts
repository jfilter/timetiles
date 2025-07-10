import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import {
  getRateLimitService,
  getClientIdentifier,
  RATE_LIMITS,
} from "../../../../../../lib/services/RateLimitService";

interface ProgressResponse {
  importId: string;
  status: string;
  stage: string;
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
  geocodingStats: Record<string, unknown>;
  currentJob?: {
    id: string;
    status: string;
    progress: number;
  };
  estimatedTimeRemaining?: number;
}

interface ProgressCounts {
  totalRows: number;
  processedRows: number;
  geocodedRows: number;
  createdEvents: number;
}

interface ImportRecord {
  progress?: {
    totalRows?: number | null;
    processedRows?: number | null;
    geocodedRows?: number | null;
    createdEvents?: number | null;
  };
  processingStage?: string | null;
  currentJobId?: string | null;
  status?: string | null;
  batchInfo?: {
    currentBatch?: number | null;
    totalBatches?: number | null;
    batchSize?: number | null;
  };
  geocodingStats?: Record<string, unknown>;
  importedAt?: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const payload = await getPayload({ config });
    const resolvedParams = await params;
    const importId = resolvedParams.importId;

    // Set up rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimitService = getRateLimitService(payload);

    // Find the import record
    let importRecord: ImportRecord;
    try {
      importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });
    } catch (error) {
      // Check if it's a NotFound error or a different error
      if (error instanceof Error && (error.message.includes("Not Found") || error.name === "NotFound")) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }
      // For other errors, throw to be caught by the outer try-catch
      throw error;
    }

    // Calculate overall progress
    const totalRows = importRecord.progress?.totalRows ?? 0;
    const processedRows = importRecord.progress?.processedRows ?? 0;
    const geocodedRows = importRecord.progress?.geocodedRows ?? 0;
    const createdEvents = importRecord.progress?.createdEvents ?? 0;

    const stageProgress = calculateStageProgress(
      importRecord.processingStage || "file-parsing",
      {
        totalRows,
        processedRows,
        geocodedRows,
        createdEvents,
      },
    );

    // Get current job status if available
    let currentJobStatus: { id: string; status: string; progress: number } | null = null;
    if (importRecord.currentJobId) {
      try {
        // In a real implementation, you would query the job queue
        // For now, we'll simulate job status
        currentJobStatus = {
          id: importRecord.currentJobId,
          status: "running",
          progress: stageProgress.percentage,
        };
      } catch (error) {
        console.warn("Failed to get job status:", error);
      }
    }

    const response: ProgressResponse = {
      importId,
      status: importRecord.status || "pending",
      stage: importRecord.processingStage || "file-parsing",
      progress: {
        current: processedRows,
        total: totalRows,
        percentage:
          totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0,
        createdEvents: createdEvents,
      },
      stageProgress,
      batchInfo: {
        currentBatch: Number(importRecord.batchInfo?.currentBatch ?? 0),
        totalBatches: Number(importRecord.batchInfo?.totalBatches ?? 0),
        batchSize: Number(importRecord.batchInfo?.batchSize ?? 100),
      },
      geocodingStats: importRecord.geocodingStats || {},
      currentJob: currentJobStatus || undefined,
      estimatedTimeRemaining: calculateEstimatedTime(importRecord),
    };

    // Add rate limit headers to response
    const headers = rateLimitService.getRateLimitHeaders(
      clientId,
      RATE_LIMITS.PROGRESS_CHECK.limit,
    );

    return NextResponse.json(response, { headers });
  } catch (error) {
    console.error("Progress tracking error:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress" },
      { status: 500 },
    );
  }
}

function calculateStageProgress(stage: string, counts: ProgressCounts) {
  switch (stage) {
    case "file-parsing":
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

function calculateEstimatedTime(importRecord: ImportRecord): number | undefined {
  // Simple estimation based on processing speed
  const totalRows = importRecord.progress?.totalRows || 0;
  const processedRows = importRecord.progress?.processedRows || 0;
  const remainingRows = totalRows - processedRows;

  if (remainingRows <= 0 || !importRecord.importedAt) {
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
