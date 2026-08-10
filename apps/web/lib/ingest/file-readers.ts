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

import Papa from "papaparse";

import { createDecodedTextStream } from "@/lib/ingest/file-encoding";
import { loadXlsx } from "@/lib/ingest/xlsx-loader";
import { logger } from "@/lib/logger";

interface StreamBatchOptions {
  sheetIndex?: number;
  batchSize: number;
}

const EXCEL_EXTENSIONS = new Set(["xlsx", "xls", "ods"]);

const getFileExtension = (filePath: string): string | undefined => filePath.toLowerCase().split(".").pop();

const isExcelExtension = (ext: string | undefined): boolean => ext !== undefined && EXCEL_EXTENSIONS.has(ext);

/**
 * Extensions parsed with the CSV reader.
 *
 * `.txt` belongs here because both the upload hooks and the URL fetcher accept
 * `text/plain` — the common case is a CSV served without a `text/csv` content type
 * (raw.githubusercontent.com and most plain file servers do exactly that). Papa's
 * delimiter auto-detection handles the actual separator.
 */
const DELIMITED_TEXT_EXTENSIONS = new Set(["csv", "txt"]);

const isDelimitedTextExtension = (ext: string | undefined): boolean =>
  ext !== undefined && DELIMITED_TEXT_EXTENSIONS.has(ext);

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
    if (isDelimitedTextExtension(fileExtension)) {
      yield* streamBatchesFromCSV(filePath, batchSize);
    } else if (isExcelExtension(fileExtension)) {
      const csvPath = getSidecarPath(filePath, sheetIndex);
      if (!fs.existsSync(csvPath)) {
        await convertSheetToCSV(filePath, sheetIndex, csvPath);
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

  const fileStream = createDecodedTextStream(csvPath);

  // Start parsing in the background
  const parsePromise = new Promise<void>((resolve, reject) => {
    Papa.parse(fileStream, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      transform: (value: string) => value.trim(),
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
    // oxlint-disable-next-line prefer-await-to-then -- fire-and-forget; awaiting would deadlock early-abort flows
    parsePromise.catch(() => {});
  }
}

/**
 * Convert an Excel/ODS sheet to a CSV sidecar file.
 */
const convertSheetToCSV = async (filePath: string, sheetIndex: number, csvPath: string): Promise<void> => {
  const { read, utils } = await loadXlsx();
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

  // blankrows:false drops fully-empty rows from a padded used-range (tools that
  // delete rows but keep formatting leave stale "!ref" bounds) — otherwise they'd
  // become phantom all-comma CSV rows downstream.
  const csvContent = utils.sheet_to_csv(worksheet, { blankrows: false });
  fs.writeFileSync(csvPath, csvContent, "utf-8");

  logger.info("Converted Excel/ODS sheet to CSV sidecar", { filePath, sheetIndex, csvPath });
};

/**
 * Get total row count from a file.
 *
 * For CSV files, uses Papa's streaming parser to count records without loading the file into memory.
 * For Excel/ODS files, loads the workbook (xlsx library requires this).
 */
export const getFileRowCount = async (filePath: string, sheetIndex = 0): Promise<number> => {
  const fileExtension = getFileExtension(filePath);

  if (isDelimitedTextExtension(fileExtension)) {
    return countCsvRecords(filePath);
  } else if (isExcelExtension(fileExtension)) {
    // xlsx library handles .xls, .xlsx, and .ods files
    const { read, utils } = await loadXlsx();
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

    // Must mirror convertSheetToCSV + streamBatchesFromCSV exactly: a stale "!ref" pads the
    // used range with blank rows, and counting those overstates the quota charge and rowsTotal.
    const csvContent = utils.sheet_to_csv(worksheet, { blankrows: false });
    return countCsvRecordsFromString(csvContent);
  }

  return 0;
};

/** Count CSV records in an in-memory string with the import parser's semantics. */
export const countCsvRecordsFromString = (csvContent: string): number => {
  let count = 0;
  Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    transform: (value: string) => value.trim(),
    step: () => {
      count++;
    },
  });
  return count;
};

/** Stream-count CSV records using the same parser semantics as import processing. */
export const countCsvRecords = (filePath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    let count = 0;
    const fileStream = createDecodedTextStream(filePath);

    Papa.parse(fileStream, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      transform: (value: string) => value.trim(),
      step: () => {
        count++;
      },
      complete: () => resolve(count),
      error: (error: Error) => reject(error),
    });
  });
