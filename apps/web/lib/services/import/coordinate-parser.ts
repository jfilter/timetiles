/**
 * Provides utility functions for parsing geographic coordinates from various string formats.
 *
 * This module contains a set of helper functions designed to interpret different representations
 * of coordinate data that might be found in imported files. It supports common formats such as:
 * - Decimal Degrees (e.g., "40.7128")
 * - Degrees Minutes Seconds (DMS) (e.g., "40°26'46\"N")
 * - Coordinates with a directional suffix (e.g., "40.7128 N")
 *
 * The main export, `parseCoordinate`, attempts to parse a value using these different strategies,
 * returning a standardized decimal degree number if successful.
 * 
 * @module
 */

/**
 * Coordinate parsing utilities
 */

/**
 * Try to parse as decimal degrees
 */
export const tryParseDecimal = (str: string): number | null => {
  const decimal = parseFloat(str);
  return !isNaN(decimal) ? decimal : null;
};

/**
 * Parse DMS (Degrees Minutes Seconds) format
 * 
 * @example
 * ```typescript
 * parseDMSFormat("40°26'46\"N"); // Returns 40.446111
 * parseDMSFormat("40 26 46 N"); // Returns 40.446111
 * ```
 */
export const parseDMSFormat = (str: string): number | null => {
  const dmsRegex = /^(-?\d{1,3})[°\s](\d{1,2})['\s](\d{1,2}\.?\d{0,6})["\s]?([NSEW])?$/i;
  const dmsMatch = dmsRegex.exec(str);

  if (
    dmsMatch?.[1] == null ||
    dmsMatch?.[1] === "" ||
    dmsMatch[2] == null ||
    dmsMatch[2] === "" ||
    dmsMatch[3] == null ||
    dmsMatch[3] === ""
  ) {
    return null;
  }

  const degrees = parseFloat(dmsMatch[1]);
  const minutes = parseFloat(dmsMatch[2]);
  const seconds = parseFloat(dmsMatch[3]);
  const direction = dmsMatch[4];

  let result = degrees + minutes / 60 + seconds / 3600;

  if (direction != null && direction !== "" && (direction.toUpperCase() === "S" || direction.toUpperCase() === "W")) {
    result = -result;
  }

  return result;
};

/**
 * Parse coordinate with direction (e.g., "40.7128 N")
 */
export const parseDirectionalFormat = (str: string): number | null => {
  const directionRegex = /^(-?\d{1,3}\.?\d{0,10})\s{0,2}([NSEW])$/i;
  const directionMatch = directionRegex.exec(str);

  if (
    directionMatch?.[1] == null ||
    directionMatch?.[1] === "" ||
    directionMatch[2] == null ||
    directionMatch[2] === ""
  ) {
    return null;
  }

  const value = parseFloat(directionMatch[1]);
  const direction = directionMatch[2];

  if (direction.toUpperCase() === "S" || direction.toUpperCase() === "W") {
    return -value;
  }
  return value;
};

/**
 * Parse various coordinate formats
 */
export const parseCoordinate = (value: unknown): number | null => {
  const normalized = validateAndNormalizeInput(value);
  if (normalized === null) {
    return null;
  }

  // Use normalized string value
  const str = normalized;

  // Try to parse as decimal degrees
  const decimal = tryParseDecimal(str);
  if (decimal !== null) {
    return decimal;
  }

  // Try DMS format
  const dmsValue = parseDMSFormat(str);
  if (dmsValue !== null) {
    return dmsValue;
  }

  // Try directional format
  const directionalValue = parseDirectionalFormat(str);
  if (directionalValue !== null) {
    return directionalValue;
  }

  return null;
};

/**
 * Validate and normalize input value
 */
const validateAndNormalizeInput = (value: unknown): string | null => {
  if (value == null || value == undefined || value === "") {
    return null;
  }

  // Handle number type
  if (typeof value === "number") {
    return String(value);
  }

  // Convert to string and clean
  return valueToString(value).trim();
};

/**
 * Convert value to string safely
 */
const valueToString = (value: unknown): string => {
  if (value == null || value == undefined) {
    return "";
  }
  if (typeof value == "string") {
    return value;
  }
  if (typeof value == "number" || typeof value == "boolean") {
    return String(value);
  }
  if (typeof value == "object") {
    return JSON.stringify(value);
  }
  // All cases handled above, this is unreachable
  return "";
};
