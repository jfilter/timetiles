import config from "@payload-config";
import { mkdir, writeFile } from "fs/promises";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { join } from "path";
import { getPayload } from "payload";
import { v4 as uuidv4 } from "uuid";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";

import { createRequestLogger, logError, logPerformance } from "@/lib/logger";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import type { Dataset, Import, User } from "@/payload-types";

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

interface ValidatedFormData {
  file: File;
  catalogId: number | null;
  datasetId: number | null;
  sessionId: string | null;
}

function validateFormData(formData: FormData): ValidatedFormData {
  const file = formData.get("file") as File;
  const catalogIdRaw = formData.get("catalogId");
  const datasetIdRaw = formData.get("datasetId");
  const sessionIdRaw = formData.get("sessionId");

  const catalogId = parseCatalogId(catalogIdRaw as string);
  const datasetId = parseDatasetId(datasetIdRaw as string | null);
  const sessionId = (sessionIdRaw as string | null)?.trim() ?? null;

  return { file, catalogId, datasetId, sessionId };
}

function parseCatalogId(catalogIdRaw: string): number | null {
  const catalogIdStr = catalogIdRaw?.trim();
  return catalogIdStr ? parseInt(catalogIdStr, 10) : null;
}

function parseDatasetId(datasetIdRaw: string | null): number | null {
  const datasetIdStr = datasetIdRaw?.trim();
  return datasetIdStr != null && datasetIdStr !== "null" ? parseInt(datasetIdStr, 10) : null;
}

function validateFileUpload(file: File, user: Pick<User, "id"> | null) {
  if (file == null) {
    return { error: "No file provided", status: 400 };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      error: `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
      status: 400,
    };
  }

  const maxSize = user ? MAX_FILE_SIZE.authenticated : MAX_FILE_SIZE.unauthenticated;
  if (file.size > maxSize) {
    return {
      error: `File too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`,
      status: 400,
    };
  }

  return null;
}

function validateCatalogId(catalogId: number | null) {
  if (catalogId == null || catalogId === 0 || isNaN(catalogId)) {
    return { error: "Valid catalog ID is required", status: 400 };
  }
  return null;
}

async function validateUploadRequest(request: NextRequest, logger: ReturnType<typeof createRequestLogger>) {
  const formData = await request.formData();
  const { file, catalogId, datasetId, sessionId } = validateFormData(formData);

  logger.debug({ catalogId, datasetId, sessionId }, "Parsed form data");

  // Validate required fields
  const fileValidation = validateFileUpload(file, null);
  if (fileValidation) {
    return {
      error: NextResponse.json({ success: false, message: fileValidation.error }, { status: fileValidation.status }),
    };
  }

  const catalogValidation = validateCatalogId(catalogId);
  if (catalogValidation) {
    return {
      error: NextResponse.json(
        { success: false, message: catalogValidation.error },
        { status: catalogValidation.status },
      ),
    };
  }

  return { file, catalogId, datasetId, sessionId };
}

function authenticateAndValidateUser(request: NextRequest, file: File, logger: ReturnType<typeof createRequestLogger>) {
  const authHeader = request.headers.get("authorization");
  const user: Pick<User, "id"> | null = authHeader != null ? getUserFromToken() : null;

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

  // Additional file validation with user context
  const userFileValidation = validateFileUpload(file, user);
  if (userFileValidation) {
    return {
      error: NextResponse.json(
        { success: false, message: userFileValidation.error },
        { status: userFileValidation.status },
      ),
    };
  }

  return { user };
}

function checkRateLimit(
  user: Pick<User, "id"> | null,
  request: NextRequest,
  rateLimitService: ReturnType<typeof getRateLimitService>,
) {
  if (user) {
    return null; // Authenticated users bypass rate limiting
  }

  const clientId = getClientIdentifier(request);
  const rateLimitResult = rateLimitService.checkRateLimit(
    clientId,
    RATE_LIMITS.FILE_UPLOAD.limit,
    RATE_LIMITS.FILE_UPLOAD.windowMs,
  );

  if (!rateLimitResult.allowed) {
    const headers = rateLimitService.getRateLimitHeaders(clientId, RATE_LIMITS.FILE_UPLOAD.limit);
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

  return null;
}

async function validateCatalog(
  payload: Awaited<ReturnType<typeof getPayload>>,
  catalogId: number,
  logger: ReturnType<typeof createRequestLogger>,
) {
  logger.debug({ catalogId }, "Looking for catalog");
  try {
    const catalog = await payload.findByID({
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
    return { catalog };
  } catch (error) {
    logger.warn({ catalogId, error: (error as Error).message }, "Catalog not found");
    return {
      error: NextResponse.json({ success: false, message: "Catalog not found" }, { status: 404 }),
    };
  }
}

async function validateDataset(
  payload: Awaited<ReturnType<typeof getPayload>>,
  datasetId: number,
  logger: ReturnType<typeof createRequestLogger>,
) {
  try {
    const dataset: Dataset = await payload.findByID({
      collection: "datasets",
      id: datasetId,
    });
    logger.debug({ datasetId, datasetName: dataset.name }, "Dataset found");
    return { dataset };
  } catch {
    return {
      error: NextResponse.json({ success: false, message: "Dataset not found" }, { status: 404 }),
    };
  }
}

async function validateCatalogAndDataset(
  payload: Awaited<ReturnType<typeof getPayload>>,
  catalogId: number,
  datasetId: number | null,
  logger: ReturnType<typeof createRequestLogger>,
) {
  // Verify catalog exists
  const catalogResult = await validateCatalog(payload, catalogId, logger);
  if ("error" in catalogResult) {
    return catalogResult;
  }

  // Verify dataset exists if provided
  if (datasetId != null) {
    const datasetResult = await validateDataset(payload, datasetId, logger);
    if ("error" in datasetResult) {
      return datasetResult;
    }
  }

  return catalogResult;
}

async function saveFileAndGetRowCount(file: File, logger: ReturnType<typeof createRequestLogger>) {
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
  const rowCount = parseFileRowCount(buffer, file.type, logger);

  return { filePath, uniqueFileName, rowCount };
}

function createProgressData(rowCount: number) {
  return {
    totalRows: rowCount,
    processedRows: 0,
    geocodedRows: 0,
    createdEvents: 0,
    percentage: 0,
  };
}

function createBatchInfo(rowCount: number) {
  return {
    batchSize: 100,
    currentBatch: 0,
    totalBatches: Math.ceil(rowCount / 100),
  };
}

function createGeocodingStats() {
  return {
    totalAddresses: 0,
    successfulGeocodes: 0,
    failedGeocodes: 0,
    cachedResults: 0,
    googleApiCalls: 0,
    nominatimApiCalls: 0,
  };
}

function buildImportData(params: {
  file: File;
  uniqueFileName: string;
  filePath: string;
  catalogId: number;
  datasetId: number | null;
  sessionId: string | null;
  user: Pick<User, "id"> | null;
  rowCount: number;
}): CreateImportData {
  const { file, uniqueFileName, filePath, catalogId, datasetId, sessionId, user, rowCount } = params;
  return {
    fileName: uniqueFileName,
    originalName: file.name,
    catalog: catalogId,
    fileSize: file.size,
    mimeType: file.type,
    user: user?.id ?? null,
    sessionId: sessionId ?? null,
    status: "pending",
    processingStage: "file-parsing",
    importedAt: new Date().toISOString(),
    rowCount: rowCount,
    errorCount: 0,
    progress: createProgressData(rowCount),
    batchInfo: createBatchInfo(rowCount),
    geocodingStats: createGeocodingStats(),
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
}

async function createImportRecord(
  payload: Awaited<ReturnType<typeof getPayload>>,
  params: {
    file: File;
    uniqueFileName: string;
    filePath: string;
    catalogId: number;
    datasetId: number | null;
    sessionId: string | null;
    user: Pick<User, "id"> | null;
    rowCount: number;
  },
  logger: ReturnType<typeof createRequestLogger>,
) {
  const { file, uniqueFileName, filePath, catalogId, datasetId, sessionId, user, rowCount } = params;
  try {
    logger.info({ catalogId, catalogType: typeof catalogId }, "Creating import record");

    const importData = buildImportData({
      file,
      uniqueFileName,
      filePath,
      catalogId,
      datasetId,
      sessionId,
      user,
      rowCount,
    });

    logger.debug({ importData }, "Import data to create");

    const importRecord = await payload.create({
      collection: "imports",
      data: importData,
    });

    logger.info({ importId: importRecord.id }, "Import record created successfully");

    return { importRecord };
  } catch (error) {
    logError(error, "Failed to create import record", {
      catalogId,
      errorData: (error as { data?: unknown }).data,
    });
    return {
      error: NextResponse.json(
        {
          success: false,
          message: `Failed to create import record: ${(error as Error).message}`,
        },
        { status: 500 },
      ),
    };
  }
}

async function queueFileParsingJob(
  payload: Awaited<ReturnType<typeof getPayload>>,
  importRecord: Import,
  filePath: string,
  file: File,
  rowCount: number,
  logger: ReturnType<typeof createRequestLogger>,
) {
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
      fileType: file.type === "text/csv" ? ("csv" as const) : ("xlsx" as const),
    },
  });

  logger.debug({ importId: importRecord.id }, "File parsing job queued successfully");
}

async function processUploadSteps(
  request: NextRequest,
  payload: Awaited<ReturnType<typeof getPayload>>,
  rateLimitService: ReturnType<typeof getRateLimitService>,
  logger: ReturnType<typeof createRequestLogger>,
) {
  // Step 1: Validate upload request
  const requestValidation = await validateUploadRequest(request, logger);
  if ("error" in requestValidation) {
    return requestValidation;
  }
  const { file, catalogId, datasetId, sessionId } = requestValidation;

  // Step 2: Authenticate and validate user
  const userValidation = authenticateAndValidateUser(request, file, logger);
  if ("error" in userValidation) {
    return userValidation;
  }
  const { user } = userValidation;

  // Step 3: Check rate limits
  const rateLimitError = checkRateLimit(user, request, rateLimitService);
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  // Step 4: Validate catalog and dataset
  const validationResult = await validateCatalogAndDataset(payload, catalogId!, datasetId, logger);
  if ("error" in validationResult) {
    return validationResult;
  }

  // Step 5: Save file and get row count
  const { filePath, uniqueFileName, rowCount } = await saveFileAndGetRowCount(file, logger);

  // Step 6: Create import record
  const importResult = await createImportRecord(
    payload,
    { file, uniqueFileName, filePath, catalogId: catalogId!, datasetId, sessionId, user, rowCount },
    logger,
  );
  if ("error" in importResult) {
    return importResult;
  }
  const { importRecord } = importResult;

  // Step 7: Queue file parsing job
  await queueFileParsingJob(payload, importRecord, filePath, file, rowCount, logger);

  return { success: true, importRecord, user, file };
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const logger = createRequestLogger(requestId);
  const startTime = Date.now();

  try {
    logger.debug("Processing import upload request");
    const payload = await getPayload({ config });
    const rateLimitService = getRateLimitService(payload);
    const clientId = getClientIdentifier(request);
    logger.debug({ clientId }, "Checking rate limits");

    const result = await processUploadSteps(request, payload, rateLimitService, logger);

    if ("error" in result) {
      return result.error;
    }

    if (!("success" in result)) {
      throw new Error("Unexpected result type");
    }
    const { importRecord, user, file } = result;

    // Return success response
    const headers = !user ? rateLimitService.getRateLimitHeaders(clientId, RATE_LIMITS.FILE_UPLOAD.limit) : {};

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

export async function GET() {
  try {
    await getPayload({ config });

    return NextResponse.json({
      success: true,
      message: "Upload API is working",
      testMode: process.env.NODE_ENV === "test",
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

function parseFileRowCount(buffer: Buffer, fileType: string, logger: ReturnType<typeof createRequestLogger>): number {
  try {
    if (fileType === "text/csv") {
      const content = buffer.toString("utf-8");
      return content.split("\n").length - 1; // Subtract header row
    } else {
      // Excel file
      const workbook = xlsxRead(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName!];
      const jsonData = xlsxUtils.sheet_to_json(worksheet!);
      return jsonData.length;
    }
  } catch (error) {
    logger.warn({ error }, "Failed to parse file for row count");
    return 0;
  }
}

function getUserFromToken(): Pick<User, "id"> | null {
  // This would implement JWT token validation
  // For now, return null (unauthenticated)
  return null;
}

// Remove old rate limiting function - now using RateLimitService
