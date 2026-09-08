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

import Papa from "papaparse";

import { createDecodedTextStream } from "@/lib/ingest/file-encoding";
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

  let headers: string[] | undefined;
  let rowCount = 0;
  await new Promise<void>((resolve, reject) => {
    Papa.parse<string[]>(createDecodedTextStream(filePath), {
      header: false,
      skipEmptyLines: true,
      step: ({ data }) => {
        if (headers === undefined) headers = data.map((header) => header.trim());
        else rowCount++;
      },
      complete: () => resolve(),
      error: reject,
    });
  });

  if (!headers?.some((header) => header.length > 0)) {
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

    // Both options match convertSheetToCSV/getFileRowCount: `blankrows: false` because a
    // stale "!ref" pads the used range and counting that padding reports more rows than the
    // import streams, and `raw: false` because the sidecar CSV holds FORMATTED text — a
    // header cell that is a date or number was detected as a serial/number here while the
    // import produced the formatted string, so the detected column name did not exist in
    // the imported rows.
    const jsonData = utils.sheet_to_json(worksheet, { header: 1, blankrows: false, raw: false });
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
