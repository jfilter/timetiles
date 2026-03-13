/**
 * Provides utility functions for reading data from files in batches.
 *
 * This module supports both random-access batch reading (`readBatchFromFile`) and
 * streaming batch iteration (`streamBatchesFromFile`). For CSV files, streaming uses
 * Papa.parse's step-based parser with pause/resume backpressure, keeping memory at
 * one batch buffer (~3MB for 1000 rows). For Excel/ODS files, the selected sheet is
 * converted to a CSV sidecar on first access, then streamed identically.
 *
 * @module
 */
import fs from "node:fs";

import Papa from "papaparse";
import { read, utils } from "xlsx";

import { logger } from "@/lib/logger";

interface ReadBatchOptions {
  sheetIndex?: number;
  startRow: number;
  limit: number;
}

interface ReadAllOptions {
  sheetIndex?: number;
}

interface StreamBatchOptions {
  sheetIndex?: number;
  batchSize: number;
}

const EXCEL_EXTENSIONS = new Set(["xlsx", "xls", "ods"]);

const getFileExtension = (filePath: string): string | undefined => filePath.toLowerCase().split(".").pop();

const isExcelExtension = (ext: string | undefined): boolean => ext !== undefined && EXCEL_EXTENSIONS.has(ext);

/**
 * Read a batch of rows from a file (CSV or Excel).
 */
export const readBatchFromFile = (filePath: string, options: ReadBatchOptions): Record<string, unknown>[] => {
  const { sheetIndex = 0, startRow, limit } = options;
  const fileExtension = getFileExtension(filePath);

  try {
    if (fileExtension === "csv") {
      return readBatchFromCSV(filePath, startRow, limit);
    } else if (isExcelExtension(fileExtension)) {
      // xlsx library handles .xls, .xlsx, and .ods files
      return readBatchFromExcel(filePath, sheetIndex, startRow, limit);
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }
  } catch (error) {
    logger.error("Failed to read batch from file", {
      filePath,
      startRow,
      limit,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Read all rows from a file (CSV or Excel) in a single parse pass.
 */
export const readAllRowsFromFile = (filePath: string, options: ReadAllOptions = {}): Record<string, unknown>[] => {
  const { sheetIndex = 0 } = options;
  const fileExtension = getFileExtension(filePath);

  try {
    if (fileExtension === "csv") {
      return readBatchFromCSV(filePath, 0, Infinity);
    } else if (isExcelExtension(fileExtension)) {
      return readBatchFromExcel(filePath, sheetIndex, 0, Infinity);
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }
  } catch (error) {
    logger.error("Failed to read all rows from file", {
      filePath,
      sheetIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Async generator that yields batches of rows from a file using streaming.
 *
 * For CSV files, uses Papa.parse's step callback with pause/resume backpressure —
 * memory stays at one batch buffer regardless of file size.
 *
 * For Excel/ODS files, transparently converts the selected sheet to a CSV sidecar
 * file on first access, then streams that CSV identically.
 *
 * @yields {Record<string, unknown>[]} A batch of parsed rows.
 */
export async function* streamBatchesFromFile(
  filePath: string,
  options: StreamBatchOptions
): AsyncGenerator<Record<string, unknown>[]> {
  const { sheetIndex = 0, batchSize } = options;
  const fileExtension = getFileExtension(filePath);

  try {
    if (fileExtension === "csv") {
      yield* streamBatchesFromCSV(filePath, batchSize);
    } else if (isExcelExtension(fileExtension)) {
      const csvPath = getSidecarPath(filePath, sheetIndex);
      if (!fs.existsSync(csvPath)) {
        convertSheetToCSV(filePath, sheetIndex, csvPath);
      }
      yield* streamBatchesFromCSV(csvPath, batchSize);
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }
  } catch (error) {
    logger.error("Failed to stream batches from file", {
      filePath,
      batchSize,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Build the sidecar CSV path for an Excel/ODS file + sheet index.
 */
export const getSidecarPath = (filePath: string, sheetIndex: number): string => `${filePath}.sheet${sheetIndex}.csv`;

/**
 * Delete any CSV sidecar files generated for a given file path.
 */
export const cleanupSidecarFiles = (filePath: string, sheetIndex = 0): void => {
  const sidecarPath = getSidecarPath(filePath, sheetIndex);
  try {
    if (fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sidecarPath);
      logger.info("Cleaned up sidecar CSV", { sidecarPath });
    }
  } catch (error) {
    logger.warn("Failed to clean up sidecar CSV", {
      sidecarPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Stream batches from a CSV file using Papa.parse step callback with backpressure.
 *
 * Uses a promise-based channel pattern:
 * 1. Papa.parse step callback pushes rows into a buffer and pauses when batch is full
 * 2. The generator awaits a "batch ready" promise
 * 3. When buffer fills, the promise resolves, generator yields the batch, then signals "drained"
 * 4. The step callback resumes on "drained" signal
 *
 * @yields {Record<string, unknown>[]} A batch of parsed rows.
 */
async function* streamBatchesFromCSV(csvPath: string, batchSize: number): AsyncGenerator<Record<string, unknown>[]> {
  let batch: Record<string, unknown>[] = [];
  let batchResolve: ((value: Record<string, unknown>[] | null) => void) | null = null;
  let drainResolve: (() => void) | null = null;
  let parseError: Error | null = null;

  const batchReady = (): Promise<Record<string, unknown>[] | null> =>
    new Promise((resolve) => {
      batchResolve = resolve;
    });

  const waitForDrain = (): Promise<void> =>
    new Promise((resolve) => {
      drainResolve = resolve;
    });

  const signalDrain = (): void => {
    if (drainResolve) {
      const resolve = drainResolve;
      drainResolve = null;
      resolve();
    }
  };

  const signalBatch = (rows: Record<string, unknown>[] | null): void => {
    if (batchResolve) {
      const resolve = batchResolve;
      batchResolve = null;
      resolve(rows);
    }
  };

  const fileStream = fs.createReadStream(csvPath, { encoding: "utf-8" });

  // Start parsing in the background
  const parsePromise = new Promise<void>((resolve, reject) => {
    Papa.parse(fileStream, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: (header: string) => header.trim(),
      step: (result: Papa.ParseStepResult<Record<string, unknown>>, parser: Papa.Parser) => {
        batch.push(result.data);

        if (batch.length >= batchSize) {
          parser.pause();
          const fullBatch = batch;
          batch = [];
          signalBatch(fullBatch);

          // Wait for consumer to drain before resuming (step is synchronous — must fire async)
          void (async () => {
            await waitForDrain();
            parser.resume();
          })();
        }
      },
      complete: () => {
        // Flush remaining rows
        if (batch.length > 0) {
          const remaining = batch;
          batch = [];
          signalBatch(remaining);

          // After consumer drains the final batch, signal end
          void (async () => {
            await waitForDrain();
            signalBatch(null);
          })();
        } else {
          signalBatch(null); // Signal end
        }
        resolve();
      },
      error: (error: Error) => {
        parseError = error;
        signalBatch(null);
        reject(error);
      },
    });
  });

  // Consume batches as they become available
  try {
    while (true) {
      const result = await batchReady();

      if (parseError !== null) {
        throw parseError as Error;
      }

      if (result === null) {
        break;
      }

      yield result;
      signalDrain();
    }

    // Wait for parse to fully complete (handles any final cleanup)
    await parsePromise;
  } finally {
    // Unblock any paused step callback before destroying the stream,
    // otherwise the waitForDrain() promise leaks if the consumer exits early.
    signalDrain();
    fileStream.destroy();
    // Swallow expected rejection from aborting mid-parse
    parsePromise.catch(() => {});
  }
}

/**
 * Convert an Excel/ODS sheet to a CSV sidecar file.
 */
const convertSheetToCSV = (filePath: string, sheetIndex: number, csvPath: string): void => {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[sheetIndex];

  if (!sheetName) {
    throw new Error(`Sheet index ${sheetIndex} not found in workbook`);
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Worksheet ${sheetName} not found`);
  }

  const csvContent = utils.sheet_to_csv(worksheet);
  fs.writeFileSync(csvPath, csvContent, "utf-8");

  logger.info("Converted Excel/ODS sheet to CSV sidecar", { filePath, sheetIndex, csvPath });
};

/**
 * Read a batch of rows from a CSV file.
 */
const readBatchFromCSV = (filePath: string, startRow: number, limit: number): Record<string, unknown>[] => {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  // Parse CSV with headers using PapaParse
  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true, // Keep enabled - useful for production
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    logger.warn("CSV parsing warnings", { errors: result.errors });
  }

  // Return the requested batch
  return (result.data as Record<string, unknown>[]).slice(startRow, startRow + limit);
};

/**
 * Read a batch of rows from an Excel file.
 */
const readBatchFromExcel = (
  filePath: string,
  sheetIndex: number,
  startRow: number,
  limit: number
): Record<string, unknown>[] => {
  // Use buffer approach instead of direct file path for better compatibility
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[sheetIndex];

  if (!sheetName) {
    throw new Error(`Sheet index ${sheetIndex} not found in workbook`);
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Worksheet ${sheetName} not found`);
  }

  // Convert to JSON with headers
  const jsonData = utils.sheet_to_json(worksheet, { header: 1, defval: null });

  if (jsonData.length === 0) {
    return [];
  }

  // Extract headers from first row
  const headers = jsonData[0] as string[];

  // Convert to objects, accounting for header row
  const dataStartRow = startRow + 1; // +1 to skip header
  const dataEndRow = Math.min(dataStartRow + limit, jsonData.length);

  const rows: Record<string, unknown>[] = [];
  for (let i = dataStartRow; i < dataEndRow; i++) {
    const row = jsonData[i];
    if (!row || !Array.isArray(row)) continue;

    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header && !Object.hasOwn(Object.prototype, header)) {
        obj[header] = row[index] ?? null;
      }
    });

    rows.push(obj);
  }

  return rows;
};

/**
 * Get total row count from a file.
 */
export const getFileRowCount = (filePath: string, sheetIndex = 0): number => {
  const fileExtension = getFileExtension(filePath);

  if (fileExtension === "csv") {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const result = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
    return result.data.length;
  } else if (isExcelExtension(fileExtension)) {
    // xlsx library handles .xls, .xlsx, and .ods files
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[sheetIndex];

    if (!sheetName) {
      return 0;
    }

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return 0;
    }

    const jsonData = utils.sheet_to_json(worksheet, { header: 1 });
    return Math.max(0, jsonData.length - 1); // Subtract header row
  }

  return 0;
};
