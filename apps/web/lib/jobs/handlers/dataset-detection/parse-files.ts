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

import { parseCsvText, scanCsvFile } from "@/lib/ingest/file-readers";
import { loadXlsx } from "@/lib/ingest/xlsx-loader";
import { logger } from "@/lib/logger";

export interface SheetInfo {
  name: string;
  index: number;
  rowCount: number;
  columnCount?: number;
  headers?: string[];
}

/**
 * Stream CSV records once to extract headers and count data rows.
 */
export const processCSVFile = async (filePath: string): Promise<SheetInfo[]> => {
  logger.info("Processing CSV file", { filePath });

  const { fields: headers, rowCount } = await scanCsvFile(filePath);
  if (headers === null) {
    throw new Error("No data rows found in file");
  }

  return [{ name: "CSV Data", index: 0, rowCount, columnCount: headers.length, headers }];
};

export const processExcelFile = async (filePath: string): Promise<SheetInfo[]> => {
  logger.info("Processing Excel file", { filePath });
  const { read, utils } = await loadXlsx();
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = read(fileBuffer, { type: "buffer" });
  const sheets: SheetInfo[] = [];

  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheetName = workbook.SheetNames[i];
    const worksheet = workbook.Sheets[sheetName!];
    if (!worksheet) continue;

    // Same conversion and parser as the import's sidecar, so headers and counts match it.
    let rowCount = 0;
    const headers = parseCsvText(utils.sheet_to_csv(worksheet, { blankrows: false }), () => {
      rowCount++;
    });
    if (headers.length > 0) {
      sheets.push({ name: sheetName ?? `Sheet${i}`, index: i, rowCount, columnCount: headers.length, headers });
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

  const wizardConfig = metadata.wizardConfig as
    | { sheetMappings?: Array<{ sheetIndex: number; newDatasetName?: string }> }
    | undefined;

  if (datasetMapping.mappingType === "single") {
    const index = wizardConfig?.sheetMappings?.[0]?.sheetIndex ?? 0;
    return [{ name: `Sheet ${index + 1}`, index, rowCount: 0 }];
  }

  if (datasetMapping.mappingType === "multiple" && wizardConfig?.sheetMappings?.length) {
    return wizardConfig.sheetMappings.map((sm) => ({
      name: sm.newDatasetName ?? `Sheet ${sm.sheetIndex + 1}`,
      index: sm.sheetIndex,
      rowCount: 0,
    }));
  }

  return null;
};
