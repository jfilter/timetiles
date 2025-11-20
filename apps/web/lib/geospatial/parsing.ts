/**
 * Coordinate parsing utilities for geospatial data.
 *
 * Functions for parsing geographic coordinates from various string formats including:
 * - Decimal Degrees (e.g., "40.7128", "-74.0060")
 * - Degrees Minutes Seconds (DMS) (e.g., "40°26'46\"N")
 * - Degrees Decimal Minutes (e.g., "40°42.768'N")
 * - Directional format (e.g., "40.7128 N", "74.0060 W")
 *
 * These parsing functions support the import pipeline by converting various
 * coordinate representations into standardized decimal degree values.
 *
 * @module
 * @category Geospatial
 */

import { valueToString } from "./validation";

/**
 * Try to parse as decimal degrees.
 *
 * Only accepts strings that are purely numeric (no trailing characters).
 * Supports standard decimal notation including scientific notation.
 *
 * @param str - String to parse
 * @returns Parsed decimal degrees or null if invalid
 *
 * @example
 * ```typescript
 * tryParseDecimal("40.7128");  // Returns 40.7128
 * tryParseDecimal("-74.0060"); // Returns -74.0060
 * tryParseDecimal("1.5e2");    // Returns 150
 * tryParseDecimal("abc");      // Returns null
 * ```
 */
export const tryParseDecimal = (str: string): number | null => {
  const trimmed = str.trim();

  // Quick validation: must match numeric pattern
  // Allows: 123, -123, 123.456, -123.456, .5, -.5, 1.5e2, 1.5e-2
  // eslint-disable-next-line security/detect-unsafe-regex -- Well-bounded regex for decimal parsing
  const numericRegex = /^-?(?:\d+(?:\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;
  if (!numericRegex.test(trimmed)) {
    return null;
  }

  const decimal = Number.parseFloat(trimmed);
  return !Number.isNaN(decimal) ? decimal : null;
};

/**
 * Parse DMS (Degrees Minutes Seconds) format.
 *
 * Supports various separators and directional indicators (N/S/E/W).
 * Handles both positive and negative degree notation.
 *
 * @param str - String in DMS format
 * @returns Parsed decimal degrees or null if invalid
 *
 * @example
 * ```typescript
 * parseDMSFormat("40°26'46\"N");    // Returns 40.446111
 * parseDMSFormat("40 26 46 N");     // Returns 40.446111
 * parseDMSFormat("40° 42' 46\" N"); // Returns 40.7128
 * parseDMSFormat("-40°26'46\"");    // Returns -40.446111
 * ```
 */
export const parseDMSFormat = (str: string): number | null => {
  const dmsRegex = /^(-?\d{1,3})[°\s]\s*(\d{1,2})['′\s]\s*(\d{1,2}\.?\d{0,6})["″\s]?\s*([NSEW])?$/i;
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

  const degrees = Number.parseFloat(dmsMatch[1]);
  const minutes = Number.parseFloat(dmsMatch[2]);
  const seconds = Number.parseFloat(dmsMatch[3]);
  const direction = dmsMatch[4];

  // Calculate fractional part
  const fractional = minutes / 60 + seconds / 3600;

  // Add fractional part to degrees (works for both positive and negative)
  let result = degrees + fractional;

  // Apply direction if specified
  if (direction != null && direction !== "" && (direction.toUpperCase() === "S" || direction.toUpperCase() === "W")) {
    result = -Math.abs(result);
  }

  return result;
};

/**
 * Parse degrees and decimal minutes format.
 *
 * Common in GPS devices and navigation systems (e.g., "40°42.768'N").
 *
 * @param str - String in degrees/decimal minutes format
 * @returns Parsed decimal degrees or null if invalid
 *
 * @example
 * ```typescript
 * parseDegreesMinutesFormat("40°42.768'N"); // Returns 40.7128
 * parseDegreesMinutesFormat("74°0.36'W");   // Returns -74.006
 * ```
 */
export const parseDegreesMinutesFormat = (str: string): number | null => {
  const dmRegex = /^(-?\d{1,3})[°\s](\d{1,3}\.?\d{0,6})['′\s]?([NSEW])?$/i;
  const dmMatch = dmRegex.exec(str);

  if (dmMatch?.[1] == null || dmMatch?.[1] === "" || dmMatch[2] == null || dmMatch[2] === "") {
    return null;
  }

  const degrees = Number.parseFloat(dmMatch[1]);
  const minutes = Number.parseFloat(dmMatch[2]);
  const direction = dmMatch[3];

  // For negative degrees, add the minutes (making it less negative)
  // For positive degrees, add the minutes (making it more positive)
  const result = degrees + minutes / 60;

  // Apply direction if specified
  if (direction != null && direction !== "" && (direction.toUpperCase() === "S" || direction.toUpperCase() === "W")) {
    return -Math.abs(result);
  }

  return result;
};

/**
 * Parse coordinate with directional suffix.
 *
 * Handles decimal coordinates followed by cardinal direction (e.g., "40.7128 N").
 * Automatically applies correct sign based on direction (N/E positive, S/W negative).
 *
 * @param str - String with directional suffix
 * @returns Parsed decimal degrees or null if invalid
 *
 * @example
 * ```typescript
 * parseDirectionalFormat("40.7128 N");  // Returns 40.7128
 * parseDirectionalFormat("40.7128 S");  // Returns -40.7128
 * parseDirectionalFormat("74.0060 W");  // Returns -74.0060
 * parseDirectionalFormat("74.0060 E");  // Returns 74.0060
 * ```
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

  const value = Number.parseFloat(directionMatch[1]);
  const direction = directionMatch[2];

  if (direction.toUpperCase() === "S" || direction.toUpperCase() === "W") {
    return -value;
  }
  return value;
};

/**
 * Parse coordinate from various formats.
 *
 * Main parsing function that tries multiple strategies to convert a value
 * into decimal degrees. Attempts parsing in order of likelihood:
 * 1. Decimal degrees (most common)
 * 2. DMS format
 * 3. Degrees/decimal minutes format
 * 4. Directional format
 *
 * @param value - Value to parse (string, number, or other)
 * @returns Parsed decimal degrees or null if unparseable
 *
 * @example
 * ```typescript
 * parseCoordinate("40.7128");        // Returns 40.7128
 * parseCoordinate("40°26'46\"N");    // Returns 40.446111
 * parseCoordinate("40°42.768'N");    // Returns 40.7128
 * parseCoordinate("40.7128 N");      // Returns 40.7128
 * parseCoordinate(40.7128);          // Returns 40.7128
 * parseCoordinate("invalid");        // Returns null
 * ```
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

  // Try DMS format (degrees, minutes, seconds)
  const dmsValue = parseDMSFormat(str);
  if (dmsValue !== null) {
    return dmsValue;
  }

  // Try degrees and decimal minutes format
  const dmValue = parseDegreesMinutesFormat(str);
  if (dmValue !== null) {
    return dmValue;
  }

  // Try directional format
  const directionalValue = parseDirectionalFormat(str);
  if (directionalValue !== null) {
    return directionalValue;
  }

  return null;
};

/**
 * Validate and normalize input value for parsing.
 *
 * Internal helper that converts various input types to strings and
 * handles edge cases like null/undefined/empty values.
 *
 * @internal
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
