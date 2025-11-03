/**
 * Provides utility functions for reading data from files in batches.
 *
 * This module is designed to efficiently process large CSV or Excel files without loading
 * the entire file into memory. It offers a `readBatchFromFile` function that can read a
 * specific chunk of rows from a file, which is essential for the background job processing
 * of large data imports. It also provides a helper to get the total row count of a file.
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

/**
 * Read a batch of rows from a file (CSV or Excel).
 */
export const readBatchFromFile = (filePath: string, options: ReadBatchOptions): Record<string, unknown>[] => {
  const { sheetIndex = 0, startRow, limit } = options;
  const fileExtension = filePath.toLowerCase().split(".").pop();

  try {
    if (fileExtension === "csv") {
      return readBatchFromCSV(filePath, startRow, limit);
    } else if (fileExtension === "xlsx" || fileExtension === "xls") {
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
 * Read a batch of rows from a CSV file.
 */
const readBatchFromCSV = (filePath: string, startRow: number, limit: number): Record<string, unknown>[] => {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  // Parse CSV with headers using PapaParse
  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
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
  const jsonData = utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
  });

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
      if (header) {
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
  const fileExtension = filePath.toLowerCase().split(".").pop();

  if (fileExtension === "csv") {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const result = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });
    return result.data.length;
  } else if (fileExtension === "xlsx" || fileExtension === "xls") {
    // Use buffer approach instead of direct file path for better compatibility
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
