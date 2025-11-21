/**
 * Applies import transform rules to incoming data.
 *
 * This service transforms raw import data (CSV rows, JSON objects, Excel rows)
 * according to dataset-level transform rules, enabling flexible field mapping
 * and schema evolution.
 *
 * Transforms are applied before schema detection and validation, ensuring
 * that incoming data is normalized to match the dataset's canonical schema
 * regardless of the source format.
 *
 * @module
 * @category Services
 */

import type { ImportTransform } from "@/lib/types/import-transforms";

/**
 * Apply transform rules to a data object.
 *
 * Transforms are applied in the order they appear in the transforms array.
 * Only active transforms are applied. The input data object is cloned
 * to avoid mutations.
 *
 * @param data - The data object to transform (CSV row, JSON object, etc.)
 * @param transforms - Array of transform rules to apply
 * @returns Transformed data object with field mappings applied
 *
 * @example
 * ```typescript
 * const data = { date: "2024-01-15", name: "Event" };
 * const transforms = [
 *   { type: "rename", from: "date", to: "start_date", active: true }
 * ];
 * const result = applyTransforms(data, transforms);
 * // Returns: { start_date: "2024-01-15", name: "Event" }
 * ```
 */
export const applyTransforms = (
  data: Record<string, unknown>,
  transforms: ImportTransform[]
): Record<string, unknown> => {
  // Clone to avoid mutating input
  const result = structuredClone(data);

  // Apply only active transforms
  const activeTransforms = transforms.filter((t) => t.active);

  for (const transform of activeTransforms) {
    if (transform.type === "rename") {
      applyRenameTransform(result, transform);
    }
    // Future: handle other transform types (split, merge, compute)
  }

  return result;
};

/**
 * Apply a rename transform using path notation.
 *
 * Supports dot notation for nested paths (e.g., "user.email").
 * If the source field doesn't exist, the transform is skipped.
 * If the source field exists, it's moved to the target path and
 * removed from the source path.
 *
 * @param data - The data object to transform (mutated in place)
 * @param transform - The rename transform to apply
 */
const applyRenameTransform = (data: Record<string, unknown>, transform: ImportTransform): void => {
  const value = getByPath(data, transform.from);

  // Only apply if source field exists
  if (value !== undefined) {
    setByPath(data, transform.to, value);
    deleteByPath(data, transform.from);
  }
};

/**
 * Get value at path using dot notation.
 *
 * Supports nested paths like "user.email" or "coordinates.0".
 * Returns undefined if any part of the path doesn't exist.
 *
 * @param obj - The object to traverse
 * @param path - Dot-separated path string (e.g., "user.email")
 * @returns Value at the path, or undefined if not found
 *
 * @example
 * ```typescript
 * const obj = { user: { email: "test@example.com" } };
 * getByPath(obj, "user.email"); // Returns: "test@example.com"
 * getByPath(obj, "user.phone"); // Returns: undefined
 * ```
 */
export const getByPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce((current: unknown, key: string) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

/**
 * Set value at path using dot notation.
 *
 * Creates nested objects as needed along the path.
 * Supports setting values in nested structures.
 *
 * @param obj - The object to modify (mutated in place)
 * @param path - Dot-separated path string (e.g., "user.email")
 * @param value - Value to set at the path
 *
 * @example
 * ```typescript
 * const obj = {};
 * setByPath(obj, "user.email", "test@example.com");
 * // Result: { user: { email: "test@example.com" } }
 * ```
 */
export const setByPath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) {
    throw new Error(`Invalid path: ${path}`);
  }

  // Navigate/create nested structure
  const target = keys.reduce((current: Record<string, unknown>, key: string) => {
    // Create nested object if it doesn't exist
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    return current[key] as Record<string, unknown>;
  }, obj);

  // Set the value at the target
  target[lastKey] = value;
};

/**
 * Delete value at path using dot notation.
 *
 * Removes the property at the specified path.
 * Does nothing if the path doesn't exist.
 * Does not clean up empty parent objects.
 *
 * @param obj - The object to modify (mutated in place)
 * @param path - Dot-separated path string (e.g., "user.email")
 *
 * @example
 * ```typescript
 * const obj = { user: { email: "test@example.com", name: "John" } };
 * deleteByPath(obj, "user.email");
 * // Result: { user: { name: "John" } }
 * ```
 */
export const deleteByPath = (obj: Record<string, unknown>, path: string): void => {
  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) {
    return;
  }

  // Navigate to parent object
  const parent = keys.reduce((current: unknown, key: string) => {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, obj);

  // Delete the property if parent exists and is an object
  if (parent && typeof parent === "object") {
    delete (parent as Record<string, unknown>)[lastKey];
  }
};

/**
 * Apply transforms to an array of data objects.
 *
 * Convenience function for batch processing.
 * Each object is transformed independently.
 *
 * @param dataArray - Array of data objects to transform
 * @param transforms - Array of transform rules to apply
 * @returns Array of transformed data objects
 *
 * @example
 * ```typescript
 * const rows = [
 *   { date: "2024-01-15", name: "Event 1" },
 *   { date: "2024-01-16", name: "Event 2" }
 * ];
 * const transforms = [
 *   { type: "rename", from: "date", to: "start_date", active: true }
 * ];
 * const result = applyTransformsBatch(rows, transforms);
 * // Returns array with start_date instead of date
 * ```
 */
export const applyTransformsBatch = (
  dataArray: Record<string, unknown>[],
  transforms: ImportTransform[]
): Record<string, unknown>[] => dataArray.map((data) => applyTransforms(data, transforms));
