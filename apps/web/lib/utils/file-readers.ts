/**
 * Provides utility functions for reading data from files in batches.
 *
 * This module provides streaming batch iteration (`streamBatchesFromFile`). For CSV files, streaming uses
 * Papa.parse's step-based parser with pause/resume backpressure, keeping memory at
 * one batch buffer (~3MB for 1000 rows). For Excel/ODS files, the selected sheet is
 * converted to a CSV sidecar on first access, then streamed identically.
 *
 * @module
 */
import fs from "node:fs";
import readline from "node:readline";

import Papa from "papaparse";
import { read, utils } from "xlsx";

import { logger } from "@/lib/logger";

interface StreamBatchOptions {
  sheetIndex?: number;
  batchSize: number;
}

const EXCEL_EXTENSIONS = new Set(["xlsx", "xls", "ods"]);

const getFileExtension = (filePath: string): string | undefined => filePath.toLowerCase().split(".").pop();

const isExcelExtension = (ext: string | undefined): boolean => ext !== undefined && EXCEL_EXTENSIONS.has(ext);

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
 * Get total row count from a file.
 *
 * For CSV files, uses streaming line count to avoid loading the entire file into memory.
 * For Excel/ODS files, loads the workbook (xlsx library requires this).
 */
export const getFileRowCount = async (filePath: string, sheetIndex = 0): Promise<number> => {
  const fileExtension = getFileExtension(filePath);

  if (fileExtension === "csv") {
    return countCsvRows(filePath);
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

/** Stream-count CSV data rows (excludes header, skips empty lines). */
const countCsvRows = (filePath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    let count = 0;
    let isHeader = true;
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (isHeader) {
        isHeader = false;
        return;
      }
      if (line.trim().length > 0) count++;
    });
    rl.on("close", () => resolve(count));
    rl.on("error", reject);
  });
