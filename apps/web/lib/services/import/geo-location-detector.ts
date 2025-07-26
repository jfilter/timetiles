import { logger } from "@/lib/logger";

import { parseCoordinate } from "./coordinate-parser";
import {
  categorizeCoordinateValue,
  type CoordinateSample,
  isValidCoordinate,
  isValidLatitudeCandidate,
  isValidLongitudeCandidate,
  valueToString,
} from "./coordinate-validation-utils";
import {
  checkCommaFormat,
  checkGeoJsonFormat,
  checkSpaceFormat,
  combinedPatterns,
  latitudePatterns,
  longitudePatterns,
} from "./format-detector";

export interface GeoColumnResult {
  found: boolean;
  type?: "separate" | "combined" | "none";
  latColumn?: string;
  lonColumn?: string;
  combinedColumn?: string;
  format?: string;
  confidence?: number;
  detectionMethod?: "pattern" | "heuristic" | "manual";
  swappedCoordinates?: boolean;
}

export class GeoLocationDetector {
  /**
   * Safely get value from row object
   */
  private getRowValue(row: Record<string, unknown>, key: string): unknown {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
    return undefined;
  }

  private readonly log = logger.child({ component: "GeoLocationDetector" });

  /**
   * Detect geolocation columns in the imported data
   */
  detectGeoColumns(headers: string[], sampleRows: Record<string, unknown>[]): GeoColumnResult {
    this.log.info(`Detecting geo columns from ${headers.length} headers`);

    // Step 1: Try to find separate lat/lon columns by pattern
    const latColumn = this.findColumnByPatterns(headers, latitudePatterns);
    const lonColumn = this.findColumnByPatterns(headers, longitudePatterns);

    if (latColumn != null && latColumn != undefined && lonColumn != null && lonColumn != undefined) {
      const validation = this.validateCoordinatePairs(sampleRows, latColumn, lonColumn);
      if (validation.isValid) {
        return {
          found: true,
          type: "separate",
          latColumn,
          lonColumn,
          confidence: validation.confidence,
          detectionMethod: "pattern",
          swappedCoordinates: validation.swapped,
        };
      }
    }

    // Step 2: Check for combined columns
    const combinedColumn = this.findColumnByPatterns(headers, combinedPatterns);
    if (combinedColumn != null && combinedColumn != undefined) {
      const format = this.detectCombinedFormat(sampleRows, combinedColumn);
      if (format != null && format != undefined) {
        return {
          found: true,
          type: "combined",
          combinedColumn,
          format: format.format,
          confidence: format.confidence,
          detectionMethod: "pattern",
        };
      }
    }

    // Step 3: Heuristic detection - check all columns for coordinate-like values
    const heuristicResult = this.detectByHeuristics(headers, sampleRows);
    if (heuristicResult.found) {
      return heuristicResult;
    }

    return { found: false, type: "none" };
  }

  /**
   * Find column by matching patterns
   */
  private findColumnByPatterns(headers: string[], patterns: RegExp[]): string | null {
    for (const header of headers) {
      const normalizedHeader = header.trim();
      for (const pattern of patterns) {
        if (pattern.test(normalizedHeader)) {
          this.log.debug(`Found column "${header}" matching pattern ${pattern}`);
          return header;
        }
      }
    }
    return null;
  }

  /**
   * Validate coordinate pairs from sample rows
   */
  private validateCoordinatePairs(
    sampleRows: Record<string, unknown>[],
    latColumn: string,
    lonColumn: string,
  ): { isValid: boolean; confidence: number; swapped: boolean } {
    const samples = this.extractCoordinateSamples(sampleRows, latColumn, lonColumn);

    if (samples.length == 0) {
      return { isValid: false, confidence: 0, swapped: false };
    }

    // Count valid samples (excluding null/invalid)
    const nonNullSamples = samples.filter((s) => s.lat != null && s.lon != null);
    if (nonNullSamples.length == 0) {
      return { isValid: false, confidence: 0, swapped: false };
    }

    const validSamples = nonNullSamples.filter((s) => s.isValid);
    const validRatio = validSamples.length / nonNullSamples.length;

    // Check if coordinates might be swapped
    const swappedSamples = nonNullSamples.filter(
      (s) => s.lat != null && s.lon != null && Math.abs(s.lat) > 90 && Math.abs(s.lat) <= 180 && Math.abs(s.lon) <= 90,
    );
    const swappedRatio = swappedSamples.length / nonNullSamples.length;

    // If most coordinates appear swapped, that's a strong signal
    if (swappedRatio > 0.5) {
      // Re-check validity with swapped coordinates
      const swappedValidSamples = nonNullSamples.filter((s) => isValidCoordinate(s.lon, s.lat));
      const swappedValidRatio = swappedValidSamples.length / nonNullSamples.length;

      return {
        isValid: swappedValidRatio >= 0.5,
        confidence: swappedValidRatio,
        swapped: true,
      };
    }

    return {
      isValid: validRatio >= 0.5, // Lower threshold for mixed data
      confidence: validRatio,
      swapped: false,
    };
  }

  /**
   * Extract coordinate samples from rows
   */
  private extractCoordinateSamples(
    rows: Record<string, unknown>[],
    latColumn: string,
    lonColumn: string,
    limit: number = 10,
  ): CoordinateSample[] {
    const samples: CoordinateSample[] = [];

    for (let i = 0; i < Math.min(rows.length, limit); i++) {
      const row = rows[i];
      if (!row) continue;
      const latValue = this.getRowValue(row, latColumn);
      const lonValue = this.getRowValue(row, lonColumn);

      if (latValue != undefined && lonValue != undefined) {
        const lat = parseCoordinate(latValue);
        const lon = parseCoordinate(lonValue);

        samples.push({
          lat,
          lon,
          isValid: isValidCoordinate(lat, lon),
          originalValues: {
            lat: valueToString(latValue),
            lon: valueToString(lonValue),
          },
        });
      }
    }

    return samples;
  }

  /**
   * Detect combined coordinate format
   */
  private detectCombinedFormat(
    sampleRows: Record<string, unknown>[],
    column: string,
  ): { format: string; confidence: number } | null {
    const samples = sampleRows
      .slice(0, 10)
      .map((row) => (Object.prototype.hasOwnProperty.call(row, column) ? row[column] : undefined))
      .filter((val) => val != null && val != undefined && val != "");

    if (samples.length == 0) {
      return null;
    }

    // Try each format detection method
    return checkCommaFormat(samples) ?? checkSpaceFormat(samples) ?? checkGeoJsonFormat(samples) ?? null;
  }

  /**
   * Heuristic detection by analyzing column values
   */
  private detectByHeuristics(headers: string[], sampleRows: Record<string, unknown>[]): GeoColumnResult {
    // Analyze all columns to get their coordinate statistics
    const columnStats = this.analyzeColumnsForCoordinates(headers, sampleRows);

    // Find the best latitude and longitude candidates
    const { bestLat, bestLon, bestLatScore, bestLonScore } = this.findBestLatLonCandidates(columnStats);

    // Validate and return results if good candidates found
    return this.validateHeuristicCandidates(bestLat, bestLon, bestLatScore, bestLonScore, sampleRows);
  }

  /**
   * Analyze each column to gather coordinate statistics
   */
  private analyzeColumnsForCoordinates(
    headers: string[],
    sampleRows: Record<string, unknown>[],
  ): Map<
    string,
    {
      validCoords: number;
      latOnly: number;
      lonOnly: number;
      total: number;
      samples: number[];
    }
  > {
    const columnStats = new Map();

    for (const header of headers) {
      const stats = this.analyzeColumnValues(header, sampleRows);

      // Need at least half the samples to have numeric values
      if (stats.total >= Math.min(5, sampleRows.length * 0.5)) {
        columnStats.set(header, stats);
      }
    }

    return columnStats as Map<
      string,
      { validCoords: number; latOnly: number; lonOnly: number; total: number; samples: number[] }
    >;
  }

  /**
   * Analyze values in a specific column
   */
  private analyzeColumnValues(
    header: string,
    sampleRows: Record<string, unknown>[],
  ): {
    validCoords: number;
    latOnly: number;
    lonOnly: number;
    total: number;
    samples: number[];
  } {
    const stats = {
      validCoords: 0, // Valid as both lat and lon
      latOnly: 0, // Valid only as latitude (-90 to 90)
      lonOnly: 0, // Valid only as longitude but not latitude (90 to 180)
      total: 0,
      samples: [] as number[],
    };

    for (const row of sampleRows.slice(0, Math.min(20, sampleRows.length))) {
      const value = parseCoordinate(Object.prototype.hasOwnProperty.call(row, header) ? row[header] : undefined);

      if (value != null && !isNaN(value)) {
        stats.total++;
        stats.samples.push(value);
        categorizeCoordinateValue(value, stats);
      }
    }

    return stats;
  } /**
   * Find best latitude and longitude column candidates
   */
  private findBestLatLonCandidates(
    columnStats: Map<
      string,
      {
        validCoords: number;
        latOnly: number;
        lonOnly: number;
        total: number;
        samples: number[];
      }
    >,
  ): {
    bestLat: string | null;
    bestLon: string | null;
    bestLatScore: number;
    bestLonScore: number;
  } {
    let bestLat: string | null = null;
    let bestLon: string | null = null;
    let bestLatScore = 0;
    let bestLonScore = 0;

    // Find best latitude candidate
    for (const [header, stats] of columnStats.entries()) {
      const coordRatio = stats.validCoords / stats.total;

      if (isValidLatitudeCandidate(stats, coordRatio, bestLatScore)) {
        bestLat = header;
        bestLatScore = coordRatio;
      }
    }

    // Find best longitude candidate
    for (const [header, stats] of columnStats.entries()) {
      if (header == bestLat) continue;

      const coordRatio = stats.validCoords / stats.total;

      if (isValidLongitudeCandidate(stats, coordRatio, bestLonScore)) {
        bestLon = header;
        bestLonScore = coordRatio;
      }
    }

    return { bestLat, bestLon, bestLatScore, bestLonScore };
  }
  /**
   * Validate heuristic candidates and return result
   */
  private validateHeuristicCandidates(
    bestLat: string | null,
    bestLon: string | null,
    bestLatScore: number,
    bestLonScore: number,
    sampleRows: Record<string, unknown>[],
  ): GeoColumnResult {
    if (
      bestLat != null &&
      bestLat != undefined &&
      bestLat != "" &&
      bestLon != null &&
      bestLon != undefined &&
      bestLon != "" &&
      bestLat != bestLon &&
      bestLatScore >= 0.7 &&
      bestLonScore >= 0.7
    ) {
      // Validate with actual samples
      const validation = this.validateCoordinatePairs(sampleRows, bestLat, bestLon);

      if (validation.isValid || validation.swapped) {
        return {
          found: true,
          type: "separate",
          latColumn: bestLat,
          lonColumn: bestLon,
          confidence: validation.confidence,
          detectionMethod: "heuristic",
          swappedCoordinates: validation.swapped,
        };
      }
    }

    return { found: false, type: "none" };
  }
}
