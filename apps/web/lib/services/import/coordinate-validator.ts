/**
 * Provides a service for validating and normalizing geographic coordinates.
 *
 * This class encapsulates the logic for robustly handling coordinate data. It can:
 * - Validate if latitude and longitude values are within their correct ranges.
 * - Detect and optionally correct common errors, such as swapped latitude and longitude.
 * - Identify suspicious values, like (0,0).
 * - Extract coordinate pairs from a single combined field (e.g., "lat, lon" or GeoJSON).
 * - Parse coordinates from various string formats (e.g., DMS, decimal degrees).
 *
 * @module
 */
import { logger } from "@/lib/logger";

export interface ValidatedCoordinates {
  latitude: number;
  longitude: number;
  isValid: boolean;
  validationStatus: "valid" | "out_of_range" | "suspicious_zero" | "swapped" | "invalid";
  confidence: number;
  originalValues?: {
    lat: string;
    lon: string;
  };
  wasSwapped?: boolean;
}

export interface CoordinateExtraction {
  latitude: number | null;
  longitude: number | null;
  format: string;
  isValid: boolean;
}

export class CoordinateValidator {
  private readonly log = logger.child({ component: "CoordinateValidator" });

  /**
   * Check for null/invalid coordinate values.
   */
  private checkNullInvalidValues(lat: number | null, lon: number | null): ValidatedCoordinates | null {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      return {
        latitude: 0,
        longitude: 0,
        isValid: false,
        validationStatus: "invalid",
        confidence: 0,
      };
    }
    return null;
  }

  /**
   * Check for suspicious (0,0) coordinates.
   */
  private checkSuspiciousZero(lat: number, lon: number): ValidatedCoordinates | null {
    if (lat == 0 && lon == 0) {
      return {
        latitude: lat,
        longitude: lon,
        isValid: false,
        validationStatus: "suspicious_zero",
        confidence: 0.1,
      };
    }
    return null;
  }

  /**
   * Check and handle swapped coordinates.
   */
  private checkSwappedCoordinates(lat: number, lon: number, autoFix: boolean): ValidatedCoordinates | null {
    if (Math.abs(lat) > 90 && Math.abs(lat) <= 180 && Math.abs(lon) <= 90) {
      if (autoFix) {
        return {
          latitude: lon,
          longitude: lat,
          isValid: true,
          validationStatus: "swapped",
          confidence: 0.8,
          wasSwapped: true,
        };
      }
      return {
        latitude: lat,
        longitude: lon,
        isValid: false,
        validationStatus: "swapped",
        confidence: 0.3,
      };
    }
    return null;
  }

  /**
   * Validate and potentially fix coordinates.
   */
  validateCoordinates(lat: number | null, lon: number | null, autoFix: boolean = true): ValidatedCoordinates {
    // Check for null/invalid values
    const nullCheck = this.checkNullInvalidValues(lat, lon);
    if (nullCheck) return nullCheck;

    // At this point we know lat and lon are valid numbers
    const validLat = lat!;
    const validLon = lon!;

    // Check for suspicious (0,0)
    const zeroCheck = this.checkSuspiciousZero(validLat, validLon);
    if (zeroCheck) return zeroCheck;

    // Check if coordinates are swapped
    const swapCheck = this.checkSwappedCoordinates(validLat, validLon, autoFix);
    if (swapCheck) return swapCheck;

    // Check valid ranges
    if (!this.isValidLatitude(validLat) || !this.isValidLongitude(validLon)) {
      return {
        latitude: validLat,
        longitude: validLon,
        isValid: false,
        validationStatus: "out_of_range",
        confidence: 0,
      };
    }

    // All checks passed
    return {
      latitude: validLat,
      longitude: validLon,
      isValid: true,
      validationStatus: "valid",
      confidence: 1.0,
    };
  }

  /**
   * Extract coordinates from a combined column.
   */
  extractFromCombined(value: unknown, format: string): CoordinateExtraction {
    if (value == null || value == undefined || value == "") {
      return { latitude: null, longitude: null, format, isValid: false };
    }

    let strValue: string;
    if (typeof value === "string") {
      strValue = value.trim();
    } else if (typeof value === "number" || typeof value === "boolean") {
      strValue = String(value).trim();
    } else if (typeof value === "object" && value != null) {
      strValue = JSON.stringify(value).trim();
    } else {
      strValue = "";
    }

    switch (format) {
      case "combined_comma":
        return this.extractCommaFormat(strValue);

      case "combined_space":
        return this.extractSpaceFormat(strValue);

      case "geojson":
        return this.extractGeoJsonFormat(value);

      default:
        // Try to auto-detect format
        return this.extractAutoDetect(strValue);
    }
  }

  /**
   * Extract from comma-separated format.
   */
  private extractCommaFormat(value: string): CoordinateExtraction {
    const regex = /^(-?\d{1,3}\.?\d{0,10}),\s{0,5}(-?\d{1,3}\.?\d{0,10})$/;
    const match = regex.exec(value);
    if (match && isValidMatchGroup(match, 1) && isValidMatchGroup(match, 2)) {
      const lat = parseFloat(match[1]!);
      const lon = parseFloat(match[2]!);
      const validated = this.validateCoordinates(lat, lon);

      return {
        latitude: validated.latitude,
        longitude: validated.longitude,
        format: "combined_comma",
        isValid: validated.isValid,
      };
    }
    return {
      latitude: null,
      longitude: null,
      format: "combined_comma",
      isValid: false,
    };
  }

  /**
   * Extract from space-separated format.
   */
  private extractSpaceFormat(value: string): CoordinateExtraction {
    const regex = /^(-?\d{1,3}\.?\d{0,10})\s{1,5}(-?\d{1,3}\.?\d{0,10})$/;
    const match = regex.exec(value);
    if (match && isValidMatchGroup(match, 1) && isValidMatchGroup(match, 2)) {
      const lat = parseFloat(match[1]!);
      const lon = parseFloat(match[2]!);
      const validated = this.validateCoordinates(lat, lon);

      return {
        latitude: validated.latitude,
        longitude: validated.longitude,
        format: "combined_space",
        isValid: validated.isValid,
      };
    }
    return {
      latitude: null,
      longitude: null,
      format: "combined_space",
      isValid: false,
    };
  }

  /**
   * Extract from GeoJSON format.
   */
  private extractGeoJsonFormat(value: unknown): CoordinateExtraction {
    try {
      const parsed: unknown = typeof value == "string" ? JSON.parse(value) : value;
      if (
        parsed != null &&
        parsed != undefined &&
        typeof parsed == "object" &&
        (parsed as Record<string, unknown>).type == "Point" &&
        Array.isArray((parsed as Record<string, unknown>).coordinates)
      ) {
        const coords = (parsed as Record<string, unknown>).coordinates as unknown[];
        if (coords.length >= 2 && typeof coords[0] == "number" && typeof coords[1] == "number") {
          const lon = coords[0];
          const lat = coords[1]; // GeoJSON is [lon, lat]
          const validated = this.validateCoordinates(lat, lon);

          return {
            latitude: validated.latitude,
            longitude: validated.longitude,
            format: "geojson",
            isValid: validated.isValid,
          };
        }
      }
    } catch (e) {
      this.log.debug("Failed to parse GeoJSON", { value, error: e });
    }
    return {
      latitude: null,
      longitude: null,
      format: "geojson",
      isValid: false,
    };
  }

  /**
   * Auto-detect and extract coordinates.
   */
  private extractAutoDetect(value: string): CoordinateExtraction {
    // Try comma format first
    const commaResult = this.extractCommaFormat(value);
    if (commaResult.isValid) return commaResult;

    // Try space format
    const spaceResult = this.extractSpaceFormat(value);
    if (spaceResult.isValid) return spaceResult;

    // Try brackets format [lat, lon] - using string parsing to avoid regex security issues
    if (value.includes(",")) {
      const cleaned = value.replace(/[[\]]/g, "").trim();
      const parts = cleaned.split(",");
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]?.trim() ?? "");
        const lon = parseFloat(parts[1]?.trim() ?? "");
        if (!isNaN(lat) && !isNaN(lon)) {
          const validated = this.validateCoordinates(lat, lon);
          return {
            latitude: validated.latitude,
            longitude: validated.longitude,
            format: "brackets",
            isValid: validated.isValid,
          };
        }
      }
    }

    return {
      latitude: null,
      longitude: null,
      format: "unknown",
      isValid: false,
    };
  }

  /**
   * Validate latitude range.
   */
  isValidLatitude(value: number): boolean {
    return value >= -90 && value <= 90;
  }

  /**
   * Validate longitude range.
   */
  isValidLongitude(value: number): boolean {
    return value >= -180 && value <= 180;
  }

  /**
   * Check for common coordinate mistakes in a batch.
   */
  detectSwappedCoordinates(samples: Array<{ lat: number; lon: number }>): boolean {
    if (samples.length == 0) return false;

    const possiblySwapped = samples.filter(
      (s) => Math.abs(s.lat) > 90 && Math.abs(s.lat) <= 180 && Math.abs(s.lon) <= 90
    );

    return possiblySwapped.length > samples.length * 0.7;
  }

  /**
   * Parse various coordinate formats to decimal degrees.
   */
  parseCoordinate(value: unknown): number | null {
    if (value == null || value == undefined || value === "") {
      return null;
    }

    // Handle number type
    if (typeof value == "number") {
      return value;
    }

    // Convert to string and clean
    const str = this.convertValueToString(value);

    // Try different coordinate formats in order
    return (
      this.parseDMSFormat(str) ??
      this.parseDegreesMinutesFormat(str) ??
      this.parseDegreesWithDirectionFormat(str) ??
      this.parseDecimalDegrees(str)
    );
  }

  /**
   * Convert unknown value to clean string.
   */
  private convertValueToString(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    } else if (typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    } else if (typeof value === "object" && value != null) {
      return JSON.stringify(value).trim();
    } else {
      return "";
    }
  }

  /**
   * Parse DMS format (e.g., "40°42'46"N" or "40° 42' 46" N").
   */
  private parseDMSFormat(str: string): number | null {
    const dmsRegex = /^(-?\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}\.?\d{0,6})["″]\s*([NSEW])?$/i;
    const dmsMatch = dmsRegex.exec(str);

    if (dmsMatch?.[1] != null && dmsMatch[2] != null && dmsMatch[3] != null) {
      const degrees = parseFloat(dmsMatch[1]);
      const minutes = parseFloat(dmsMatch[2]);
      const seconds = parseFloat(dmsMatch[3]);
      const direction = dmsMatch[4];

      const result = Math.abs(degrees) + minutes / 60 + seconds / 3600;
      return this.applyDirectionalSign(result, direction, degrees);
    }

    return null;
  }

  /**
   * Parse degrees and decimal minutes format (e.g., "40°42.768'N").
   */
  private parseDegreesMinutesFormat(str: string): number | null {
    const dmRegex = /^(-?\d{1,3})[°\s](\d{1,3}\.?\d{0,6})['′\s]?([NSEW])?$/i;
    const dmMatch = dmRegex.exec(str);

    if (
      dmMatch?.[1] != null &&
      dmMatch?.[1] != undefined &&
      dmMatch?.[1] != "" &&
      dmMatch[2] != null &&
      dmMatch[2] != undefined &&
      dmMatch[2] != ""
    ) {
      const degrees = parseFloat(dmMatch[1]);
      const minutes = parseFloat(dmMatch[2]);
      const direction = dmMatch[3];

      const result = Math.abs(degrees) + minutes / 60;
      return this.applyDirectionalSign(result, direction, degrees);
    }

    return null;
  }

  /**
   * Parse degrees with direction format (e.g., "40.7128 N" or "40.7128N").
   */
  private parseDegreesWithDirectionFormat(str: string): number | null {
    const trimmed = str.trim().toUpperCase();

    // Check for directional suffixes
    for (const direction of ["N", "S", "E", "W"]) {
      const result = this.tryParseWithDirection(trimmed, direction);
      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  /**
   * Helper to try parsing a coordinate with a specific direction.
   */
  private tryParseWithDirection(trimmed: string, direction: string): number | null {
    // Check direct suffix (e.g., "40.7128N")
    if (trimmed.endsWith(direction)) {
      return this.parseDirectionalValue(trimmed.slice(0, -1).trim(), direction);
    }

    // Check spaced suffix (e.g., "40.7128 N")
    if (trimmed.endsWith(` ${direction}`)) {
      return this.parseDirectionalValue(trimmed.slice(0, -(direction.length + 1)).trim(), direction);
    }

    return null;
  }

  /**
   * Parse and apply directional sign to a numeric value.
   */
  private parseDirectionalValue(numStr: string, direction: string): number | null {
    const value = parseFloat(numStr);
    if (isNaN(value)) {
      return null;
    }

    const absValue = Math.abs(value);
    return direction === "S" || direction === "W" ? -absValue : absValue;
  }

  /**
   * Parse simple decimal degrees.
   */
  private parseDecimalDegrees(str: string): number | null {
    const decimal = parseFloat(str);
    return !isNaN(decimal) ? decimal : null;
  }

  /**
   * Apply directional sign to coordinate value.
   */
  private applyDirectionalSign(result: number, direction: string | undefined, originalDegrees: number): number {
    if (
      (direction != null &&
        direction != undefined &&
        (direction.toUpperCase() == "S" || direction.toUpperCase() == "W")) ||
      originalDegrees < 0
    ) {
      return -result;
    }
    return result;
  }

  /**
   * Calculate confidence score based on coordinate characteristics.
   */
  calculateConfidence(lat: number, lon: number): number {
    let confidence = 1.0;

    // Reduce confidence for coordinates at exact integers (might be rounded)
    if (lat == Math.floor(lat) && lon == Math.floor(lon)) {
      confidence *= 0.9;
    }

    // Reduce confidence for coordinates near boundaries
    if (Math.abs(lat) > 85 || Math.abs(lon) > 175) {
      confidence *= 0.95;
    }

    // Reduce confidence for common test coordinates
    const testCoords = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 },
      { lat: -1, lon: -1 },
      { lat: 12.345678, lon: 12.345678 },
    ];

    for (const test of testCoords) {
      if (Math.abs(lat - test.lat) < 0.0001 && Math.abs(lon - test.lon) < 0.0001) {
        confidence *= 0.5;
        break;
      }
    }

    return confidence;
  }
}

const isValidMatchGroup = (
  match: RegExpExecArray,
  index: number
): match is RegExpExecArray & { [K in typeof index]: string } => match[index] != undefined && match[index] != null;
