/**
 * File parsing helpers for dataset detection.
 *
 * Handles CSV, Excel, and wizard-metadata fast-path parsing to extract
 * sheet information without loading entire files into memory.
 *
 * @module
 * @category Jobs
 */
import fs from "node:fs";
import readline from "node:readline";

import Papa from "papaparse";
import { read, utils } from "xlsx";

import { logger } from "@/lib/logger";

export interface SheetInfo {
  name: string;
  index: number;
  rowCount: number;
  columnCount?: number;
  headers?: string[];
}

/**
 * Read the first line of a CSV to extract headers, then stream-count remaining data rows.
 * Avoids loading the entire file into memory (the previous implementation used readFileSync
 * + Papa.parse which buffered everything).
 */
export const processCSVFile = async (filePath: string): Promise<SheetInfo[]> => {
  logger.info("Processing CSV file", { filePath });

  // Read only the first line to get headers
  const headerLine = await new Promise<string>((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let resolved = false;

    rl.once("line", (line) => {
      resolved = true;
      rl.close();
      stream.destroy();
      resolve(line);
    });
    rl.once("error", reject);
    // Guard: only resolve empty if "line" never fired (truly empty file)
    rl.once("close", () => {
      if (!resolved) resolve("");
    });
  });

  if (!headerLine.trim()) {
    throw new Error("No data rows found in file");
  }

  // Parse the header line with Papa to handle quoted fields, commas in values, etc.
  const headerResult = Papa.parse(headerLine, { header: false, skipEmptyLines: true });
  const headers = (headerResult.data[0] as string[]) ?? [];

  // Stream-count remaining data rows (excludes header, skips empty lines)
  const rowCount = await new Promise<number>((resolve, reject) => {
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

  if (rowCount === 0 && headers.length === 0) {
    throw new Error("No data rows found in file");
  }

  return [{ name: "CSV Data", index: 0, rowCount, columnCount: headers.length, headers }];
};

export const processExcelFile = (filePath: string): SheetInfo[] => {
  logger.info("Processing Excel file", { filePath });
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = read(fileBuffer, { type: "buffer" });
  const sheets: SheetInfo[] = [];

  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheetName = workbook.SheetNames[i];
    const worksheet = workbook.Sheets[sheetName!];
    if (!worksheet) continue;

    const jsonData = utils.sheet_to_json(worksheet, { header: 1 });
    if (jsonData.length > 0 && jsonData[0]) {
      sheets.push({
        name: sheetName ?? `Sheet${i}`,
        index: i,
        rowCount: jsonData.length - 1,
        columnCount: Array.isArray(jsonData[0]) ? jsonData[0].length : 0,
        headers: Array.isArray(jsonData[0]) ? jsonData[0] : [],
      });
    }
  }

  return sheets;
};

/**
 * Build minimal SheetInfo from wizard metadata, skipping file I/O.
 * Returns null if metadata is incomplete (falls through to normal parsing).
 */
export const buildSheetsFromWizardMetadata = (metadata: Record<string, unknown>): SheetInfo[] | null => {
  if (metadata.source !== "import-wizard") return null;

  const datasetMapping = metadata.datasetMapping as
    | { mappingType: string; singleDataset?: unknown; sheetMappings?: unknown[] }
    | undefined;
  if (!datasetMapping) return null;

  if (datasetMapping.mappingType === "single") {
    return [{ name: "Sheet 1", index: 0, rowCount: 0 }];
  }

  const wizardConfig = metadata.wizardConfig as
    | { sheetMappings?: Array<{ sheetIndex: number; newDatasetName?: string }> }
    | undefined;

  if (datasetMapping.mappingType === "multiple" && wizardConfig?.sheetMappings?.length) {
    return wizardConfig.sheetMappings.map((sm) => ({
      name: sm.newDatasetName ?? `Sheet ${sm.sheetIndex + 1}`,
      index: sm.sheetIndex,
      rowCount: 0,
    }));
  }

  return null;
};
