import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  getRateLimitService,
  getClientIdentifier,
  RATE_LIMITS,
} from "../../../../lib/services/RateLimitService";
import type { Catalog, Dataset, Import, User } from "../../../../payload-types";
import {
  createRequestLogger,
  logError,
  logPerformance,
} from "../../../../lib/logger";

// Type for creating new import records, excluding auto-generated fields
type CreateImportData = Omit<Import, "id" | "createdAt" | "updatedAt">;

const ALLOWED_MIME_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_FILE_SIZE = {
  authenticated: 100 * 1024 * 1024, // 100MB
  unauthenticated: 10 * 1024 * 1024, // 10MB
};

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const logger = createRequestLogger(requestId);
  const startTime = Date.now();

  try {
    logger.debug("Processing import upload request");
    // Use global test payload instance if available (for tests)
    const payload =
      (global as any).__TEST_PAYLOAD__ || (await getPayload({ config }));

    // Check rate limiting for unauthenticated users
    const clientId = getClientIdentifier(request);
    const rateLimitService = getRateLimitService(payload);
    logger.debug({ clientId }, "Checking rate limits");

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const catalogIdRaw = formData.get("catalogId");
    const datasetIdRaw = formData.get("datasetId");
    const sessionIdRaw = formData.get("sessionId");

    logger.debug({ catalogIdRaw, datasetIdRaw, sessionIdRaw }, "Raw form data");

    const catalogIdStr = (catalogIdRaw as string)?.trim();
    const catalogId = catalogIdStr ? parseInt(catalogIdStr, 10) : null;
    const datasetIdStr = (datasetIdRaw as string | null)?.trim();
    const datasetId =
      datasetIdStr && datasetIdStr !== "null"
        ? parseInt(datasetIdStr, 10)
        : null;
    const sessionId = (sessionIdRaw as string | null)?.trim() || null;

    logger.debug({ catalogId, datasetId, sessionId }, "Parsed form data");

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file provided" },
        { status: 400 },
      );
    }

    if (!catalogId || isNaN(catalogId)) {
      return NextResponse.json(
        { success: false, message: "Valid catalog ID is required" },
        { status: 400 },
      );
    }

    // Get user from request (if authenticated)
    const user: Pick<User, "id"> | null = request.headers.get("authorization")
      ? await getUserFromToken()
      : null;

    logger.debug(
      {
        isAuthenticated: !!user,
        userId: user?.id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
      "Processing file upload request",
    );

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          message: `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Check file size limits
    const maxSize = user
      ? MAX_FILE_SIZE.authenticated
      : MAX_FILE_SIZE.unauthenticated;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          message: `File too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`,
        },
        { status: 400 },
      );
    }

    // Check rate limits for unauthenticated users
    if (!user) {
      const rateLimitResult = await rateLimitService.checkRateLimit(
        clientId,
        RATE_LIMITS.FILE_UPLOAD.limit,
        RATE_LIMITS.FILE_UPLOAD.windowMs,
      );

      if (!rateLimitResult.allowed) {
        const headers = rateLimitService.getRateLimitHeaders(
          clientId,
          RATE_LIMITS.FILE_UPLOAD.limit,
        );
        return NextResponse.json(
          {
            success: false,
            message: "Rate limit exceeded. Please try again later.",
            resetTime: new Date(rateLimitResult.resetTime).toISOString(),
          },
          {
            status: 429,
            headers,
          },
        );
      }
    }

    // Verify catalog exists
    logger.debug({ catalogId }, "Looking for catalog");
    let catalog: Catalog;
    try {
      catalog = await payload.findByID({
        collection: "catalogs",
        id: catalogId,
      });
      logger.debug(
        {
          catalogId,
          catalogName: catalog.name,
          catalogSlug: catalog.slug,
        },
        "Catalog found and validated",
      );
    } catch (error) {
      logger.warn(
        { catalogId, error: (error as Error).message },
        "Catalog not found",
      );
      return NextResponse.json(
        { success: false, message: "Catalog not found" },
        { status: 404 },
      );
    }

    // Verify dataset exists if provided
    if (datasetId) {
      try {
        const dataset: Dataset = await payload.findByID({
          collection: "datasets",
          id: datasetId,
        });
        logger.debug({ datasetId, datasetName: dataset.name }, "Dataset found");
      } catch {
        return NextResponse.json(
          { success: false, message: "Dataset not found" },
          { status: 404 },
        );
      }
    }

    // Generate unique filename
    const fileExtension = file.name.split(".").pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    // Save file to disk
    const filePath = join(uploadsDir, uniqueFileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Parse file to get row count
    let rowCount = 0;
    try {
      if (file.type === "text/csv") {
        const content = buffer.toString("utf-8");
        rowCount = content.split("\n").length - 1; // Subtract header row
      } else {
        // Excel file
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName!];
        const jsonData = XLSX.utils.sheet_to_json(worksheet!);
        rowCount = jsonData.length;
      }
    } catch (error) {
      logger.warn({ error }, "Failed to parse file for row count");
      rowCount = 0;
    }

    // Create import record
    let importRecord: Import;
    try {
      logger.info(
        { catalogId, catalogType: typeof catalogId },
        "Creating import record",
      );

      const importData: CreateImportData = {
        fileName: uniqueFileName,
        originalName: file.name,
        catalog: catalogId,
        fileSize: file.size,
        mimeType: file.type,
        user: user?.id || null,
        sessionId: sessionId || null,
        status: "pending",
        processingStage: "file-parsing",
        importedAt: new Date().toISOString(),
        rowCount: rowCount,
        errorCount: 0,
        progress: {
          totalRows: rowCount,
          processedRows: 0,
          geocodedRows: 0,
          createdEvents: 0,
          percentage: 0,
        },
        batchInfo: {
          batchSize: 100,
          currentBatch: 0,
          totalBatches: Math.ceil(rowCount / 100),
        },
        geocodingStats: {
          totalAddresses: 0,
          successfulGeocodes: 0,
          failedGeocodes: 0,
          cachedResults: 0,
          googleApiCalls: 0,
          nominatimApiCalls: 0,
        },
        rateLimitInfo: !user
          ? {
              sessionId,
              timestamp: new Date().toISOString(),
            }
          : null,
        jobHistory: [],
        metadata: {
          uploadedAt: new Date().toISOString(),
          filePath,
          datasetId,
        },
      };

      logger.debug({ importData }, "Import data to create");

      importRecord = await payload.create({
        collection: "imports",
        data: importData,
      });

      logger.info(
        { importId: importRecord.id },
        "Import record created successfully",
      );
    } catch (error) {
      logError(error, "Failed to create import record", {
        catalogId,
        errorData: (error as { data?: unknown }).data,
      });
      return NextResponse.json(
        {
          success: false,
          message: `Failed to create import record: ${(error as Error).message}`,
        },
        { status: 500 },
      );
    }

    // Queue the file parsing job
    logger.info(
      {
        importId: importRecord.id,
        fileName: file.name,
        fileType: file.type === "text/csv" ? "csv" : "xlsx",
        estimatedRows: rowCount,
        estimatedBatches: Math.ceil(rowCount / 100),
      },
      "Queueing file parsing job",
    );

    await payload.jobs.queue({
      task: "file-parsing",
      input: {
        importId: importRecord.id,
        filePath,
        fileName: file.name,
        fileType:
          file.type === "text/csv" ? ("csv" as const) : ("xlsx" as const),
      },
    });

    logger.debug(
      { importId: importRecord.id },
      "File parsing job queued successfully",
    );

    // Add rate limit headers to successful response
    const headers = !user
      ? rateLimitService.getRateLimitHeaders(
          clientId,
          RATE_LIMITS.FILE_UPLOAD.limit,
        )
      : {};

    logPerformance("Upload request", Date.now() - startTime, {
      requestId,
      importId: importRecord.id,
      fileSize: file.size,
      fileType: file.type,
    });

    return NextResponse.json(
      {
        success: true,
        importId: importRecord.id,
        message: "File uploaded successfully and processing started",
      },
      { headers },
    );
  } catch (error) {
    logError(error, "Upload error", { requestId });
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Use global test payload instance if available (for tests)
    const payload =
      (global as any).__TEST_PAYLOAD__ || (await getPayload({ config }));

    return NextResponse.json({
      success: true,
      message: "Upload API is working",
      hasGlobalPayload: !!(global as any).__TEST_PAYLOAD__,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Upload API failed",
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}

async function getUserFromToken(): Promise<Pick<User, "id"> | null> {
  // This would implement JWT token validation
  // For now, return null (unauthenticated)
  return null;
}

// Remove old rate limiting function - now using RateLimitService
