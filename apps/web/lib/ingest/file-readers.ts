/**
 * Provides utility functions for reading data from files in batches.
 *
 * This module provides streaming batch iteration (`streamBatchesFromFile`). For CSV files, streaming
 * pauses the file stream while a full batch waits for the consumer, keeping memory at one batch
 * plus one read chunk. For Excel/ODS files, the selected sheet is converted to a CSV sidecar on
 * first access, then streamed identically.
 *
 * Every reader of an ingest CSV — import stages, row counts, dataset detection, the wizard
 * preview — turns parsed lines into records through `createCsvRecordBuilder`, so they all agree
 * on the header row, header names and row sequence.
 *
 * @module
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Readable } from "node:stream";

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

/** Whether the file is read with the CSV reader rather than as a spreadsheet. */
export const isDelimitedTextFile = (filePath: string): boolean => isDelimitedTextExtension(getFileExtension(filePath));

/**
 * Papa runs without header mode: its header handling misreads the first line after a
 * resume as a header and skips duplicate renaming when blank lines precede the header.
 */
const CSV_PARSE_OPTIONS = { header: false, skipEmptyLines: true } as const;

/** Rename repeated header names to `name_1`, `name_2`, … without colliding with existing names. */
const dedupeHeaders = (names: string[]): string[] => {
  const used = new Set(names);
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    let suffix = count;
    let candidate = `${name}_${suffix}`;
    while (used.has(candidate)) {
      suffix++;
      candidate = `${name}_${suffix}`;
    }
    used.add(candidate);
    return candidate;
  });
};

export interface CsvRecordBuilder {
  /** Header names, or null while no non-blank line has been seen. */
  fields: string[] | null;
  /** The record for one parsed line, or null for the header line and the blank lines before it. */
  toRecord: (cells: string[]) => Record<string, unknown> | null;
}

/**
 * Turn parsed CSV lines into records: the first line with a non-blank cell is the header,
 * values are trimmed, and cells beyond the header are collected under `__parsed_extra`.
 */
export const createCsvRecordBuilder = (): CsvRecordBuilder => {
  const builder: CsvRecordBuilder = {
    fields: null,
    toRecord: (cells) => {
      const fields = builder.fields;
      if (fields === null) {
        const names = cells.map((cell) => cell.trim());
        if (names.some((name) => name !== "")) builder.fields = dedupeHeaders(names);
        return null;
      }
      const record: Record<string, unknown> = {};
      const extra: string[] = [];
      cells.forEach((cell, index) => {
        const field = fields[index];
        if (field === undefined) extra.push(cell.trim());
        else record[field] = cell.trim();
      });
      if (extra.length > 0) record.__parsed_extra = extra;
      return record;
    },
  };
  return builder;
};

/** Parse CSV text into records with the import's semantics; returns the header names. */
export const parseCsvText = (content: string, onRecord: (record: Record<string, unknown>) => void): string[] => {
  const builder = createCsvRecordBuilder();
  Papa.parse<string[]>(content, {
    ...CSV_PARSE_OPTIONS,
    step: ({ data }) => {
      const record = builder.toRecord(data);
      if (record) onRecord(record);
    },
  });
  return builder.fields ?? [];
};

/** Stream CSV lines from a text stream into a record builder. */
const parseCsvStream = (
  stream: Readable,
  builder: CsvRecordBuilder,
  handlers: { onRecord: (record: Record<string, unknown>) => void; onComplete: () => void; onError: (e: Error) => void }
): void => {
  Papa.parse<string[]>(stream, {
    ...CSV_PARSE_OPTIONS,
    step: ({ data }) => {
      const record = builder.toRecord(data);
      if (record) handlers.onRecord(record);
    },
    complete: handlers.onComplete,
    error: handlers.onError,
  });
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
 * Stream batches from a CSV file.
 *
 * Backpressure pauses the file stream, never Papa's parser: once a batch is full the stream
 * stops emitting, Papa finishes the chunk already in hand, and the generator yields exact
 * `batchSize` slices until the buffer runs low and reading resumes.
 *
 * @yields {Record<string, unknown>[]} A batch of parsed rows.
 */
async function* streamBatchesFromCSV(csvPath: string, batchSize: number): AsyncGenerator<Record<string, unknown>[]> {
  const stream = createDecodedTextStream(csvPath);
  const state: { rows: Record<string, unknown>[]; finished: boolean; failure: Error | null } = {
    rows: [],
    finished: false,
    failure: null,
  };
  let wake: (() => void) | null = null;
  const notify = (): void => {
    const resolve = wake;
    wake = null;
    resolve?.();
  };

  parseCsvStream(stream, createCsvRecordBuilder(), {
    onRecord: (record) => {
      state.rows.push(record);
      if (state.rows.length >= batchSize) {
        stream.pause();
        notify();
      }
    },
    onComplete: () => {
      state.finished = true;
      notify();
    },
    onError: (error) => {
      state.failure = error;
      notify();
    },
  });

  try {
    while (true) {
      if (state.failure) throw state.failure;
      if (state.rows.length >= batchSize || (state.finished && state.rows.length > 0)) {
        yield state.rows.splice(0, batchSize);
      } else if (state.finished) {
        return;
      } else {
        await new Promise<void>((resolve) => {
          wake = resolve;
          stream.resume();
        });
      }
    }
  } finally {
    stream.destroy();
  }
}

/**
 * Render one Excel/ODS sheet as the CSV text the import streams.
 */
const readSheetAsCsv = async (filePath: string, sheetIndex: number): Promise<string> => {
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
  return utils.sheet_to_csv(worksheet, { blankrows: false });
};

/**
 * Convert an Excel/ODS sheet to a CSV sidecar file.
 */
const convertSheetToCSV = async (filePath: string, sheetIndex: number, csvPath: string): Promise<void> => {
  const csvContent = await readSheetAsCsv(filePath, sheetIndex);
  // Only publish complete sidecars: existence is the reader's cache-validity check.
  const tempPath = `${csvPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, csvContent, "utf-8");
    fs.renameSync(tempPath, csvPath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Preserve the write error; the orphan sweep can remove the temp file later.
    }
    throw error;
  }

  logger.info("Converted Excel/ODS sheet to CSV sidecar", { filePath, sheetIndex, csvPath });
};

/**
 * Get total row count from a file.
 *
 * For CSV files, streams the file to count records without loading it into memory.
 * For Excel/ODS files, loads the workbook (xlsx library requires this).
 * Throws like the import reader for a missing sheet or an unsupported file type.
 */
export const getFileRowCount = async (filePath: string, sheetIndex = 0): Promise<number> => {
  const fileExtension = getFileExtension(filePath);

  if (isDelimitedTextExtension(fileExtension)) {
    return (await scanCsvFile(filePath)).rowCount;
  }
  if (isExcelExtension(fileExtension)) {
    let rowCount = 0;
    parseCsvText(await readSheetAsCsv(filePath, sheetIndex), () => {
      rowCount++;
    });
    return rowCount;
  }

  throw new Error(`Unsupported file type: ${fileExtension}`);
};

/** Scan a CSV file with the import's semantics: its header (null when it has none) and record count. */
export const scanCsvFile = (filePath: string): Promise<{ fields: string[] | null; rowCount: number }> =>
  new Promise((resolve, reject) => {
    const builder = createCsvRecordBuilder();
    let rowCount = 0;
    parseCsvStream(createDecodedTextStream(filePath), builder, {
      onRecord: () => {
        rowCount++;
      },
      onComplete: () => resolve({ fields: builder.fields, rowCount }),
      onError: reject,
    });
  });
