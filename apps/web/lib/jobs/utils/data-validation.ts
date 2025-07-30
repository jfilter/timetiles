/**
 * @module Provides utility functions for validating and normalizing imported data.
 *
 * This module contains helpers for various data quality and transformation tasks, such as:
 * - Performing basic structural validation on the parsed data.
 * - Normalizing date strings into a consistent ISO format.
 * - Safely accessing and cleaning string values from row objects.
 * - Extracting and parsing tags from common field names.
 */
import type { createJobLogger } from "@/lib/logger";

import { getObjectProperty } from "./data-parsing";

export const validateRequiredFields = (
  parsedData: Record<string, unknown>[],
  logger: ReturnType<typeof createJobLogger>,
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (parsedData.length === 0) {
    errors.push("No data rows found in file");
    return { isValid: false, errors };
  }

  // Check for at least one non-empty row
  const hasValidData = parsedData.some((row) => Object.values(row).some((value) => value != null && value !== ""));

  if (!hasValidData) {
    errors.push("All data rows appear to be empty");
  }

  // Check for basic data structure integrity
  const firstRowKeys = Object.keys(parsedData[0] ?? {});
  if (firstRowKeys.length === 0) {
    errors.push("No column headers detected");
  }

  // Validate that most rows have a similar structure
  const inconsistentRows = parsedData.filter((row) => {
    const rowKeys = Object.keys(row);
    const commonKeys = firstRowKeys.filter((key) => rowKeys.includes(key));
    return commonKeys.length < firstRowKeys.length * 0.5; // At least 50% of columns should be present
  });

  if (inconsistentRows.length > parsedData.length * 0.1) {
    errors.push(`${inconsistentRows.length} rows have inconsistent column structure`);
  }

  logger.info("Field validation completed", {
    totalRows: parsedData.length,
    inconsistentRows: inconsistentRows.length,
    errors: errors.length,
  });

  return { isValid: errors.length === 0, errors };
};

export const parseDate = (dateString: string | number | Date): string => {
  if (dateString instanceof Date) {
    return dateString.toISOString();
  }

  if (typeof dateString === "number") {
    return new Date(dateString).toISOString();
  }

  if (typeof dateString !== "string" || dateString.trim() === "") {
    return new Date().toISOString();
  }

  const parsed = new Date(dateString.trim());
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
};

export const safeStringValue = (row: Record<string, unknown>, key: string): string | null => {
  const value = getObjectProperty(row, key);
  if (value == null || value === "") {
    return null;
  }
  return String(value as string).trim();
};

export const hasValidProperty = (obj: Record<string, unknown>, key: string): boolean => {
  const value = getObjectProperty(obj, key);
  return value != null && value !== "";
};

export const parseTagsFromRow = (row: Record<string, unknown>): string[] => {
  const tags: string[] = [];

  // Look for common tag column names
  const tagFields = ["tags", "categories", "keywords", "labels"];

  for (const field of tagFields) {
    const value = safeStringValue(row, field);
    if (value != null) {
      // Split by common separators and clean up
      const splitTags = value
        .split(/[,;|]/)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      tags.push(...splitTags);
      break; // Only use the first matching field
    }
  }

  // Remove duplicates and limit to reasonable number
  return Array.from(new Set(tags)).slice(0, 10);
};
