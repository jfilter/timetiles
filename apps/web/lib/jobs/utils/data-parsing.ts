import fs from "fs";
import Papa from "papaparse";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";

import type { createJobLogger } from "@/lib/logger";

export const setObjectProperty = (obj: Record<string, unknown>, key: string, value: unknown): void => {
  // Safe property assignment
  if (typeof key == "string" && key.length > 0 && !Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
    obj[key] = value;
  }
};

export const getObjectProperty = (obj: Record<string, unknown>, key: string): unknown => {
  // Safe property access to avoid object injection
  if (typeof key == "string" && Object.prototype.hasOwnProperty.call(obj, key)) {
    return obj[key];
  }
  return undefined;
};

export const parseCSVFile = (
  filePath: string,
  logger: ReturnType<typeof createJobLogger>,
): Record<string, unknown>[] => {
  logger.info("Starting CSV parsing", { filePath });

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const csvContent = fs.readFileSync(filePath, "utf-8");
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  if (parseResult.errors.length > 0) {
    logger.warn("CSV parsing warnings", { errors: parseResult.errors });
  }

  logger.info("CSV parsing completed", { rowCount: parseResult.data.length });
  return parseResult.data as Record<string, unknown>[];
};

export const parseExcelFile = (
  filePath: string,
  logger: ReturnType<typeof createJobLogger>,
): Record<string, unknown>[] => {
  logger.info("Starting Excel parsing", { filePath });

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const workbook = xlsxRead(fs.readFileSync(filePath));
  const firstSheetName = workbook.SheetNames[0];

  if (firstSheetName == null) {
    throw new Error("No worksheets found in Excel file");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error(`Worksheet '${firstSheetName}' not found`);
  }
  const jsonData = xlsxUtils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
  });

  if (jsonData.length === 0) {
    logger.warn("Excel file contains no data");
    return [];
  }

  const headers = jsonData[0] as string[];
  const dataRows = jsonData.slice(1);

  const parsedData = dataRows.map((row) => {
    const rowData: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const rowArray = row as unknown[];
      const cellValue = rowArray[index];
      setObjectProperty(rowData, header?.toString().trim() ?? `column_${index}`, cellValue);
    });
    return rowData;
  });

  logger.info("Excel parsing completed", { rowCount: parsedData.length });
  return parsedData;
};

export const parseFileByType = (
  filePath: string,
  fileType: "csv" | "xlsx",
  logger: ReturnType<typeof createJobLogger>,
): Record<string, unknown>[] => {
  switch (fileType) {
    case "csv":
      return parseCSVFile(filePath, logger);
    case "xlsx":
      return parseExcelFile(filePath, logger);
    default:
      throw new Error(`Unsupported file type: ${String(fileType)}`);
  }
};
