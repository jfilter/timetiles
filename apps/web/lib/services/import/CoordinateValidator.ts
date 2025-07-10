import { logger } from "../../logger";

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
   * Validate and potentially fix coordinates
   */
  validateCoordinates(
    lat: number | null,
    lon: number | null,
    autoFix: boolean = true
  ): ValidatedCoordinates {
    // Handle null/invalid values
    if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
      return {
        latitude: 0,
        longitude: 0,
        isValid: false,
        validationStatus: "invalid",
        confidence: 0,
      };
    }

    // Check for suspicious (0,0)
    if (lat === 0 && lon === 0) {
      return {
        latitude: lat,
        longitude: lon,
        isValid: false,
        validationStatus: "suspicious_zero",
        confidence: 0.1,
      };
    }

    // Check if coordinates are swapped (lat outside ±90 but within ±180)
    if (Math.abs(lat) > 90 && Math.abs(lat) <= 180 && Math.abs(lon) <= 90) {
      if (autoFix) {
        // Actually swap the coordinates
        return {
          latitude: lon,
          longitude: lat,
          isValid: true,
          validationStatus: "swapped",
          confidence: 0.8,
          wasSwapped: true,
        };
      }
      // Don't swap, just report invalid
      return {
        latitude: lat,
        longitude: lon,
        isValid: false,
        validationStatus: "swapped",
        confidence: 0.3,
      };
    }

    // Check valid ranges
    if (!this.isValidLatitude(lat) || !this.isValidLongitude(lon)) {
      return {
        latitude: lat,
        longitude: lon,
        isValid: false,
        validationStatus: "out_of_range",
        confidence: 0,
      };
    }

    // All checks passed
    return {
      latitude: lat,
      longitude: lon,
      isValid: true,
      validationStatus: "valid",
      confidence: 1.0,
    };
  }

  /**
   * Extract coordinates from a combined column
   */
  extractFromCombined(value: any, format: string): CoordinateExtraction {
    if (value === null || value === undefined || value === "") {
      return { latitude: null, longitude: null, format, isValid: false };
    }

    const strValue = String(value).trim();

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
   * Extract from comma-separated format
   */
  private extractCommaFormat(value: string): CoordinateExtraction {
    const match = value.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const validated = this.validateCoordinates(lat, lon);
      
      return {
        latitude: validated.latitude,
        longitude: validated.longitude,
        format: "combined_comma",
        isValid: validated.isValid,
      };
    }
    return { latitude: null, longitude: null, format: "combined_comma", isValid: false };
  }

  /**
   * Extract from space-separated format
   */
  private extractSpaceFormat(value: string): CoordinateExtraction {
    const match = value.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const validated = this.validateCoordinates(lat, lon);
      
      return {
        latitude: validated.latitude,
        longitude: validated.longitude,
        format: "combined_space",
        isValid: validated.isValid,
      };
    }
    return { latitude: null, longitude: null, format: "combined_space", isValid: false };
  }

  /**
   * Extract from GeoJSON format
   */
  private extractGeoJsonFormat(value: any): CoordinateExtraction {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (parsed && parsed.type === "Point" && Array.isArray(parsed.coordinates)) {
        const [lon, lat] = parsed.coordinates; // GeoJSON is [lon, lat]
        const validated = this.validateCoordinates(lat, lon);
        
        return {
          latitude: validated.latitude,
          longitude: validated.longitude,
          format: "geojson",
          isValid: validated.isValid,
        };
      }
    } catch (e) {
      this.log.debug("Failed to parse GeoJSON", { value, error: e });
    }
    return { latitude: null, longitude: null, format: "geojson", isValid: false };
  }

  /**
   * Auto-detect and extract coordinates
   */
  private extractAutoDetect(value: string): CoordinateExtraction {
    // Try comma format first
    const commaResult = this.extractCommaFormat(value);
    if (commaResult.isValid) return commaResult;

    // Try space format
    const spaceResult = this.extractSpaceFormat(value);
    if (spaceResult.isValid) return spaceResult;

    // Try brackets format [lat, lon]
    const bracketMatch = value.match(/^\[?\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\]?$/);
    if (bracketMatch) {
      const lat = parseFloat(bracketMatch[1]);
      const lon = parseFloat(bracketMatch[2]);
      const validated = this.validateCoordinates(lat, lon);
      
      return {
        latitude: validated.latitude,
        longitude: validated.longitude,
        format: "brackets",
        isValid: validated.isValid,
      };
    }

    return { latitude: null, longitude: null, format: "unknown", isValid: false };
  }

  /**
   * Validate latitude range
   */
  isValidLatitude(value: number): boolean {
    return value >= -90 && value <= 90;
  }

  /**
   * Validate longitude range
   */
  isValidLongitude(value: number): boolean {
    return value >= -180 && value <= 180;
  }

  /**
   * Check for common coordinate mistakes in a batch
   */
  detectSwappedCoordinates(samples: Array<{ lat: number; lon: number }>): boolean {
    if (samples.length === 0) return false;

    const possiblySwapped = samples.filter(s => 
      Math.abs(s.lat) > 90 && Math.abs(s.lat) <= 180 &&
      Math.abs(s.lon) <= 90
    );
    
    return possiblySwapped.length > samples.length * 0.7;
  }

  /**
   * Parse various coordinate formats to decimal degrees
   */
  parseCoordinate(value: any): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    // Handle number type
    if (typeof value === "number") {
      return value;
    }

    // Convert to string and clean
    const str = String(value).trim();

    // Try DMS format first (e.g., "40°42'46"N" or "40° 42' 46" N")
    const dmsMatch = str.match(
      /^(-?\d+)[°\s]+(\d+)['′\s]+(\d+(?:\.\d+)?)["″\s]*([NSEW])?$/i
    );
    if (dmsMatch) {
      const degrees = parseFloat(dmsMatch[1]);
      const minutes = parseFloat(dmsMatch[2]);
      const seconds = parseFloat(dmsMatch[3]);
      const direction = dmsMatch[4];

      let result = Math.abs(degrees) + (minutes / 60) + (seconds / 3600);
      
      // Apply negative sign for South/West or if degrees were originally negative
      if ((direction && (direction.toUpperCase() === "S" || direction.toUpperCase() === "W")) ||
          degrees < 0) {
        result = -result;
      }

      return result;
    }

    // Try degrees and decimal minutes (e.g., "40°42.768'N")
    const dmMatch = str.match(/^(-?\d+)[°\s]+(\d+(?:\.\d+)?)['′\s]*([NSEW])?$/i);
    if (dmMatch) {
      const degrees = parseFloat(dmMatch[1]);
      const minutes = parseFloat(dmMatch[2]);
      const direction = dmMatch[3];

      let result = Math.abs(degrees) + (minutes / 60);
      
      if ((direction && (direction.toUpperCase() === "S" || direction.toUpperCase() === "W")) ||
          degrees < 0) {
        result = -result;
      }

      return result;
    }

    // Try degrees with direction (e.g., "40.7128 N" or "40.7128N")
    const directionMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*([NSEW])$/i);
    if (directionMatch) {
      const value = Math.abs(parseFloat(directionMatch[1]));
      const direction = directionMatch[2];
      
      if (direction.toUpperCase() === "S" || direction.toUpperCase() === "W") {
        return -value;
      }
      return value;
    }

    // Finally, try to parse as decimal degrees
    const decimal = parseFloat(str);
    if (!isNaN(decimal)) {
      return decimal;
    }

    return null;
  }

  /**
   * Calculate confidence score based on coordinate characteristics
   */
  calculateConfidence(lat: number, lon: number): number {
    let confidence = 1.0;

    // Reduce confidence for coordinates at exact integers (might be rounded)
    if (lat === Math.floor(lat) && lon === Math.floor(lon)) {
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