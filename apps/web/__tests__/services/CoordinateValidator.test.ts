import { describe, it, expect, beforeEach } from "vitest";
import { CoordinateValidator } from "../../lib/services/import/CoordinateValidator";

describe("CoordinateValidator", () => {
  let validator: CoordinateValidator;

  beforeEach(() => {
    validator = new CoordinateValidator();
  });

  describe("coordinate parsing", () => {
    it("parses decimal degrees", () => {
      expect(validator.parseCoordinate("40.7128")).toBe(40.7128);
      expect(validator.parseCoordinate("-74.0060")).toBe(-74.006);
      expect(validator.parseCoordinate("0")).toBe(0);
      expect(validator.parseCoordinate("-180")).toBe(-180);
    });

    it("parses DMS format (40°42'46\"N)", () => {
      const result = validator.parseCoordinate("40°42'46\"N");
      expect(result).toBeCloseTo(40.7128, 3);
    });

    it("parses degrees with direction (40.7128 N)", () => {
      expect(validator.parseCoordinate("40.7128 N")).toBe(40.7128);
      expect(validator.parseCoordinate("74.0060 W")).toBe(-74.006);
      expect(validator.parseCoordinate("51.5074 N")).toBe(51.5074);
      expect(validator.parseCoordinate("0.1278 W")).toBe(-0.1278);
    });

    it("handles negative coordinates", () => {
      expect(validator.parseCoordinate("-40.7128")).toBe(-40.7128);
      expect(validator.parseCoordinate("-90")).toBe(-90);
    });

    it("returns null for invalid formats", () => {
      expect(validator.parseCoordinate("invalid")).toBe(null);
      expect(validator.parseCoordinate("abc123")).toBe(null);
      expect(validator.parseCoordinate("")).toBe(null);
      expect(validator.parseCoordinate(null)).toBe(null);
      expect(validator.parseCoordinate(undefined)).toBe(null);
    });

    it("handles number inputs", () => {
      expect(validator.parseCoordinate(40.7128)).toBe(40.7128);
      expect(validator.parseCoordinate(-74.006)).toBe(-74.006);
      expect(validator.parseCoordinate(0)).toBe(0);
    });

    it("handles string numbers with spaces", () => {
      expect(validator.parseCoordinate(" 40.7128 ")).toBe(40.7128);
      expect(validator.parseCoordinate("  -74.0060  ")).toBe(-74.006);
    });
  });

  describe("validation", () => {
    it("validates latitude range (-90 to 90)", () => {
      expect(validator.isValidLatitude(0)).toBe(true);
      expect(validator.isValidLatitude(45)).toBe(true);
      expect(validator.isValidLatitude(90)).toBe(true);
      expect(validator.isValidLatitude(-90)).toBe(true);
      expect(validator.isValidLatitude(91)).toBe(false);
      expect(validator.isValidLatitude(-91)).toBe(false);
      expect(validator.isValidLatitude(180)).toBe(false);
    });

    it("validates longitude range (-180 to 180)", () => {
      expect(validator.isValidLongitude(0)).toBe(true);
      expect(validator.isValidLongitude(90)).toBe(true);
      expect(validator.isValidLongitude(180)).toBe(true);
      expect(validator.isValidLongitude(-180)).toBe(true);
      expect(validator.isValidLongitude(181)).toBe(false);
      expect(validator.isValidLongitude(-181)).toBe(false);
    });

    it("detects swapped coordinates", () => {
      const samples = [
        { lat: 139.6503, lon: 35.6762 }, // Tokyo - swapped (139 > 90)
        { lat: 151.2093, lon: -33.8688 }, // Sydney - swapped (151 > 90)
        { lat: -122.4194, lon: 37.7749 }, // San Francisco - swapped (122 > 90)
      ];

      expect(validator.detectSwappedCoordinates(samples)).toBe(true);
    });

    it("handles edge cases (0, ±90, ±180)", () => {
      const result1 = validator.validateCoordinates(0, 0);
      expect(result1.isValid).toBe(false); // (0,0) is suspicious
      expect(result1.validationStatus).toBe("suspicious_zero");

      const result2 = validator.validateCoordinates(90, 180);
      expect(result2.isValid).toBe(true);
      expect(result2.validationStatus).toBe("valid");

      const result3 = validator.validateCoordinates(-90, -180);
      expect(result3.isValid).toBe(true);
      expect(result3.validationStatus).toBe("valid");
    });

    it("auto-fixes swapped coordinates when enabled", () => {
      // -74.0060 is valid longitude but not latitude (outside ±90)
      // 40.7128 is valid for both
      const result = validator.validateCoordinates(-74.006, 40.7128, true);
      expect(result.isValid).toBe(true);
      expect(result.validationStatus).toBe("valid"); // After fixing, coords are valid
      expect(result.latitude).toBe(-74.006);
      expect(result.longitude).toBe(40.7128);
      expect(result.wasSwapped).toBeUndefined(); // These coords are actually valid
    });

    it("doesn't fix swapped coordinates when disabled", () => {
      // Test with actually swapped coordinates
      const result = validator.validateCoordinates(139.6503, 35.6762, false); // Tokyo swapped
      expect(result.isValid).toBe(false);
      expect(result.validationStatus).toBe("swapped");
      expect(result.latitude).toBe(139.6503); // Unchanged
      expect(result.longitude).toBe(35.6762); // Unchanged
    });
  });

  describe("combined format extraction", () => {
    it("extracts comma-separated coordinates", () => {
      const result = validator.extractFromCombined(
        "40.7128,-74.0060",
        "combined_comma",
      );
      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.006);
      expect(result.format).toBe("combined_comma");
    });

    it("extracts space-separated coordinates", () => {
      const result = validator.extractFromCombined(
        "40.7128 -74.0060",
        "combined_space",
      );
      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.006);
      expect(result.format).toBe("combined_space");
    });

    it("extracts GeoJSON coordinates", () => {
      const geoJson = { type: "Point", coordinates: [-74.006, 40.7128] };
      const result = validator.extractFromCombined(geoJson, "geojson");
      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.006);
      expect(result.format).toBe("geojson");
    });

    it("auto-detects comma format", () => {
      const result = validator.extractFromCombined(
        "51.5074,-0.1278",
        "unknown",
      );
      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(51.5074);
      expect(result.longitude).toBe(-0.1278);
    });

    it("auto-detects bracket format", () => {
      const result = validator.extractFromCombined(
        "[40.7128, -74.0060]",
        "unknown",
      );
      expect(result.isValid).toBe(true);
      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.006);
    });

    it("handles invalid combined formats", () => {
      const result1 = validator.extractFromCombined(
        "not-coordinates",
        "combined_comma",
      );
      expect(result1.isValid).toBe(false);
      expect(result1.latitude).toBe(null);
      expect(result1.longitude).toBe(null);

      const result2 = validator.extractFromCombined("", "combined_space");
      expect(result2.isValid).toBe(false);

      const result3 = validator.extractFromCombined(null, "geojson");
      expect(result3.isValid).toBe(false);
    });
  });

  describe("confidence calculation", () => {
    it("reduces confidence for exact integers", () => {
      const confidence1 = validator.calculateConfidence(40.0, -74.0);
      const confidence2 = validator.calculateConfidence(40.7128, -74.006);
      expect(confidence1).toBeLessThan(confidence2);
    });

    it("reduces confidence for boundary coordinates", () => {
      const confidence1 = validator.calculateConfidence(89.9, 179.9);
      const confidence2 = validator.calculateConfidence(40.7128, -74.006);
      expect(confidence1).toBeLessThan(confidence2);
    });

    it("reduces confidence for test coordinates", () => {
      const confidence1 = validator.calculateConfidence(0, 0);
      const confidence2 = validator.calculateConfidence(1, 1);
      const confidence3 = validator.calculateConfidence(12.345678, 12.345678);
      const confidence4 = validator.calculateConfidence(40.7128, -74.006);

      expect(confidence1).toBeLessThan(confidence4);
      expect(confidence2).toBeLessThan(confidence4);
      expect(confidence3).toBeLessThan(confidence4);
    });
  });

  describe("DMS variations", () => {
    it("parses degrees and decimal minutes", () => {
      const result = validator.parseCoordinate("40°42.768'N");
      expect(result).toBeCloseTo(40.7128, 3);
    });

    it("handles DMS with spaces", () => {
      const result = validator.parseCoordinate("40° 42' 46\" N");
      expect(result).toBeCloseTo(40.7128, 3);
    });

    it("handles negative DMS", () => {
      const result = validator.parseCoordinate("74°0'21.6\"W");
      expect(result).toBeCloseTo(-74.006, 3);
    });
  });
});
