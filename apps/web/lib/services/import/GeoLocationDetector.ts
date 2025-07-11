import { logger } from "../../logger";

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

export interface CoordinateSample {
  lat: number | null;
  lon: number | null;
  isValid: boolean;
  originalValues: {
    lat: string;
    lon: string;
  };
}

export class GeoLocationDetector {
  private readonly log = logger.child({ component: "GeoLocationDetector" });

  // Pattern matching for latitude columns
  private latitudePatterns = [
    /^lat(itude)?$/i,
    /^lat[_\s-]?deg(rees)?$/i,
    /^y[_\s-]?coord(inate)?$/i,
    /^location[_\s-]?lat(itude)?$/i,
    /^geo[_\s-]?lat(itude)?$/i,
    /^decimal[_\s-]?lat(itude)?$/i,
    /^latitude[_\s-]?decimal$/i,
    /^wgs84[_\s-]?lat(itude)?$/i,
  ];

  // Pattern matching for longitude columns
  private longitudePatterns = [
    /^lon(g|gitude)?$/i,
    /^lng$/i,
    /^lon[_\s-]?deg(rees)?$/i,
    /^long[_\s-]?deg(rees)?$/i,  // Added to match "long_deg"
    /^x[_\s-]?coord(inate)?$/i,
    /^location[_\s-]?lon(g|gitude)?$/i,
    /^geo[_\s-]?lon(g|gitude)?$/i,
    /^decimal[_\s-]?lon(g|gitude)?$/i,
    /^longitude[_\s-]?decimal$/i,
    /^wgs84[_\s-]?lon(g|gitude)?$/i,
  ];

  // Combined coordinate patterns
  private combinedPatterns = [
    /^coord(inate)?s$/i,
    /^lat[_\s-]?lon(g)?$/i,
    /^location$/i,
    /^geo[_\s-]?location$/i,
    /^position$/i,
    /^point$/i,
    /^geometry$/i,
    /^coordinates$/i,
  ];

  /**
   * Detect geolocation columns in the imported data
   */
  detectGeoColumns(headers: string[], sampleRows: any[]): GeoColumnResult {
    this.log.info(`Detecting geo columns from ${headers.length} headers`);

    // Step 1: Try to find separate lat/lon columns by pattern
    const latColumn = this.findColumnByPatterns(headers, this.latitudePatterns);
    const lonColumn = this.findColumnByPatterns(headers, this.longitudePatterns);

    if (latColumn && lonColumn) {
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
    const combinedColumn = this.findColumnByPatterns(headers, this.combinedPatterns);
    if (combinedColumn) {
      const format = this.detectCombinedFormat(sampleRows, combinedColumn);
      if (format) {
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
    sampleRows: any[],
    latColumn: string,
    lonColumn: string
  ): { isValid: boolean; confidence: number; swapped: boolean } {
    const samples = this.extractCoordinateSamples(sampleRows, latColumn, lonColumn);
    
    if (samples.length === 0) {
      return { isValid: false, confidence: 0, swapped: false };
    }

    // Count valid samples (excluding null/invalid)
    const nonNullSamples = samples.filter(s => s.lat !== null && s.lon !== null);
    if (nonNullSamples.length === 0) {
      return { isValid: false, confidence: 0, swapped: false };
    }

    const validSamples = nonNullSamples.filter(s => s.isValid);
    const validRatio = validSamples.length / nonNullSamples.length;

    // Check if coordinates might be swapped
    const swappedSamples = nonNullSamples.filter(s => 
      s.lat !== null && s.lon !== null &&
      Math.abs(s.lat) > 90 && Math.abs(s.lat) <= 180 &&
      Math.abs(s.lon) <= 90
    );
    const swappedRatio = swappedSamples.length / nonNullSamples.length;

    // If most coordinates appear swapped, that's a strong signal
    if (swappedRatio > 0.5) {
      // Re-check validity with swapped coordinates
      const swappedValidSamples = nonNullSamples.filter(s =>
        this.isValidCoordinate(s.lon, s.lat)
      );
      const swappedValidRatio = swappedValidSamples.length / nonNullSamples.length;
      
      return {
        isValid: swappedValidRatio >= 0.5,
        confidence: swappedValidRatio,
        swapped: true,
      };
    }

    return {
      isValid: validRatio >= 0.5,  // Lower threshold for mixed data
      confidence: validRatio,
      swapped: false,
    };
  }

  /**
   * Extract coordinate samples from rows
   */
  private extractCoordinateSamples(
    rows: any[],
    latColumn: string,
    lonColumn: string,
    limit: number = 10
  ): CoordinateSample[] {
    const samples: CoordinateSample[] = [];
    
    for (let i = 0; i < Math.min(rows.length, limit); i++) {
      const row = rows[i];
      const latValue = row[latColumn];
      const lonValue = row[lonColumn];

      if (latValue !== undefined && lonValue !== undefined) {
        const lat = this.parseCoordinate(latValue);
        const lon = this.parseCoordinate(lonValue);

        samples.push({
          lat,
          lon,
          isValid: this.isValidCoordinate(lat, lon),
          originalValues: {
            lat: String(latValue),
            lon: String(lonValue),
          },
        });
      }
    }

    return samples;
  }

  /**
   * Parse various coordinate formats
   */
  private parseCoordinate(value: any): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    // Handle number type
    if (typeof value === "number") {
      return value;
    }

    // Convert to string and clean
    const str = String(value).trim();

    // Try to parse as decimal degrees
    const decimal = parseFloat(str);
    if (!isNaN(decimal)) {
      return decimal;
    }

    // Try DMS format (e.g., "40°42'46"N")
    const dmsMatch = str.match(/^(-?\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([NSEW])?$/i);
    if (dmsMatch && dmsMatch[1] && dmsMatch[2] && dmsMatch[3]) {
      const degrees = parseFloat(dmsMatch[1]);
      const minutes = parseFloat(dmsMatch[2]);
      const seconds = parseFloat(dmsMatch[3]);
      const direction = dmsMatch[4];

      let result = degrees + minutes / 60 + seconds / 3600;
      
      if (direction && (direction.toUpperCase() === "S" || direction.toUpperCase() === "W")) {
        result = -result;
      }

      return result;
    }

    // Try degrees with direction (e.g., "40.7128 N")
    const directionMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*([NSEW])$/i);
    if (directionMatch && directionMatch[1] && directionMatch[2]) {
      const value = parseFloat(directionMatch[1]);
      const direction = directionMatch[2];
      
      if (direction.toUpperCase() === "S" || direction.toUpperCase() === "W") {
        return -value;
      }
      return value;
    }

    return null;
  }

  /**
   * Check if coordinates are valid
   */
  private isValidCoordinate(lat: number | null, lon: number | null): boolean {
    if (lat === null || lon === null) {
      return false;
    }

    // Check ranges
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return false;
    }

    // Check for suspicious (0,0) - exact zero unlikely except in ocean
    if (lat === 0 && lon === 0) {
      return false;
    }

    return true;
  }

  /**
   * Detect combined coordinate format
   */
  private detectCombinedFormat(
    sampleRows: any[],
    column: string
  ): { format: string; confidence: number } | null {
    const samples = sampleRows
      .slice(0, 10)
      .map(row => row[column])
      .filter(val => val !== null && val !== undefined && val !== "");

    if (samples.length === 0) {
      return null;
    }

    // Check for comma-separated format
    const commaFormat = samples.filter(s => {
      const match = String(s).match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
      if (match && match[1] && match[2]) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        return this.isValidCoordinate(lat, lon);
      }
      return false;
    });

    if (commaFormat.length / samples.length >= 0.7) {
      return { format: "combined_comma", confidence: commaFormat.length / samples.length };
    }

    // Check for space-separated format
    const spaceFormat = samples.filter(s => {
      const match = String(s).match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
      if (match && match[1] && match[2]) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        return this.isValidCoordinate(lat, lon);
      }
      return false;
    });

    if (spaceFormat.length / samples.length >= 0.7) {
      return { format: "combined_space", confidence: spaceFormat.length / samples.length };
    }

    // Check for GeoJSON format
    const geoJsonFormat = samples.filter(s => {
      try {
        const parsed = typeof s === "string" ? JSON.parse(s) : s;
        if (parsed && parsed.type === "Point" && Array.isArray(parsed.coordinates)) {
          const [lon, lat] = parsed.coordinates;
          return this.isValidCoordinate(lat, lon);
        }
      } catch {
        // Not JSON
      }
      return false;
    });

    if (geoJsonFormat.length / samples.length >= 0.7) {
      return { format: "geojson", confidence: geoJsonFormat.length / samples.length };
    }

    return null;
  }

  /**
   * Heuristic detection by analyzing column values
   */
  private detectByHeuristics(headers: string[], sampleRows: any[]): GeoColumnResult {
    const columnStats: Map<string, { 
      validCoords: number; 
      latOnly: number; 
      lonOnly: number; 
      total: number;
      samples: number[];
    }> = new Map();

    // Analyze each column
    for (const header of headers) {
      const stats = { 
        validCoords: 0,  // Valid as both lat and lon
        latOnly: 0,      // Valid only as latitude (-90 to 90)
        lonOnly: 0,      // Valid only as longitude but not latitude (90 to 180)
        total: 0,
        samples: [] as number[]
      };

      for (const row of sampleRows.slice(0, Math.min(20, sampleRows.length))) {
        const value = this.parseCoordinate(row[header]);
        if (value !== null && !isNaN(value)) {
          stats.total++;
          stats.samples.push(value);
          
          const absValue = Math.abs(value);
          
          if (absValue <= 90) {
            stats.validCoords++;
            stats.latOnly++;
          } else if (absValue <= 180) {
            stats.validCoords++;
            stats.lonOnly++;
          }
        }
      }

      // Need at least half the samples to have numeric values
      if (stats.total >= Math.min(5, sampleRows.length * 0.5)) {
        columnStats.set(header, stats);
      }
    }

    // Find best latitude and longitude candidates
    let bestLat: string | null = null;
    let bestLon: string | null = null;
    let bestLatScore = 0;
    let bestLonScore = 0;

    // First pass: look for columns that are clearly lat or lon
    for (const [header, stats] of columnStats.entries()) {
      const coordRatio = stats.validCoords / stats.total;
      
      // Check if this column is mostly valid latitudes (all values within -90 to 90)
      if (stats.latOnly === stats.total && coordRatio > bestLatScore) {
        // Check it's not all the same value
        const uniqueValues = new Set(stats.samples).size;
        if (uniqueValues > 1) {
          bestLat = header;
          bestLatScore = coordRatio;
        }
      }
    }

    // Second pass: find longitude column
    for (const [header, stats] of columnStats.entries()) {
      if (header === bestLat) continue;
      
      const coordRatio = stats.validCoords / stats.total;
      
      // This column has valid coordinate values
      if (coordRatio > bestLonScore) {
        const uniqueValues = new Set(stats.samples).size;
        if (uniqueValues > 1) {
          bestLon = header;
          bestLonScore = coordRatio;
        }
      }
    }

    if (bestLat && bestLon && bestLat !== bestLon && bestLatScore >= 0.7 && bestLonScore >= 0.7) {
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