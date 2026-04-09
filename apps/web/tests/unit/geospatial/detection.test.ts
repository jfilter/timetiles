/**
 * Unit tests for geospatial format detection utilities.
 *
 * Tests comma-separated, space-separated, and GeoJSON Point format detection
 * including confidence threshold behavior, edge cases, and invalid inputs.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { checkCommaFormat, checkGeoJsonFormat, checkSpaceFormat } from "../../../lib/geospatial/detection";

describe("Geospatial Format Detection", () => {
  describe("checkCommaFormat", () => {
    describe("valid detections", () => {
      it("should detect comma-separated coordinates with spaces", () => {
        const result = checkCommaFormat(["40.7128, -74.0060", "51.5074, -0.1278"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });

      it("should detect comma-separated coordinates without spaces", () => {
        const result = checkCommaFormat(["40.7128,-74.0060", "51.5074,-0.1278"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });

      it("should detect integer coordinates", () => {
        const result = checkCommaFormat(["40, -74", "51, -1"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });

      it("should detect coordinates with multiple spaces after comma", () => {
        const result = checkCommaFormat(["40.7128,  -74.0060", "51.5074,   -0.1278"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });

      it("should handle number inputs by converting to string", () => {
        // The function converts numbers to strings via String(s)
        // A bare number like 40.7128 becomes "40.7128" which does not match the comma pattern
        const result = checkCommaFormat([40.7128, 51.5074]);
        expect(result).toBeNull();
      });
    });

    describe("confidence threshold", () => {
      it("should detect when exactly 70% of samples match", () => {
        // 7 out of 10 = 0.7 confidence
        const samples = [
          "40.7128, -74.0060",
          "51.5074, -0.1278",
          "48.8566, 2.3522",
          "35.6762, 139.6503",
          "52.5200, 13.4050",
          "-33.8688, 151.2093",
          "55.7558, 37.6173",
          "not a coordinate",
          "also invalid",
          "nope",
        ];
        const result = checkCommaFormat(samples);
        expect(result).not.toBeNull();
        expect(result!.format).toBe("combined_comma");
        expect(result!.confidence).toBeCloseTo(0.7, 5);
      });

      it("should return null when below 70% threshold", () => {
        // 6 out of 10 = 0.6 confidence
        const samples = [
          "40.7128, -74.0060",
          "51.5074, -0.1278",
          "48.8566, 2.3522",
          "35.6762, 139.6503",
          "52.5200, 13.4050",
          "-33.8688, 151.2093",
          "not a coordinate",
          "also invalid",
          "nope",
          "still nope",
        ];
        const result = checkCommaFormat(samples);
        expect(result).toBeNull();
      });

      it("should return confidence of 1.0 when all samples match", () => {
        const result = checkCommaFormat(["40.7128, -74.0060", "51.5074, -0.1278", "48.8566, 2.3522"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });
    });

    describe("invalid inputs", () => {
      it("should return null for empty array", () => {
        // empty array: 0/0 = NaN, which is not >= 0.7
        const result = checkCommaFormat([]);
        expect(result).toBeNull();
      });

      it("should return null for non-coordinate strings", () => {
        const result = checkCommaFormat(["hello, world", "foo, bar"]);
        expect(result).toBeNull();
      });

      it("should return null for space-separated coordinates", () => {
        const result = checkCommaFormat(["40.7128 -74.0060", "51.5074 -0.1278"]);
        expect(result).toBeNull();
      });

      it("should return null for null and undefined values", () => {
        const result = checkCommaFormat([null, undefined, null]);
        expect(result).toBeNull();
      });

      it("should return null for boolean values", () => {
        const result = checkCommaFormat([true, false, true]);
        expect(result).toBeNull();
      });

      it("should return null for object values", () => {
        const result = checkCommaFormat([{ lat: 40 }, { lat: 51 }]);
        expect(result).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should reject coordinates out of valid range", () => {
        const result = checkCommaFormat(["91.0, -74.0060", "100.0, -181.0"]);
        expect(result).toBeNull();
      });

      it("should reject near-null-island coordinates", () => {
        // isValidCoordinate rejects coordinates within ~0.01 of (0,0)
        const result = checkCommaFormat(["0.001, 0.001", "0.005, 0.005"]);
        expect(result).toBeNull();
      });

      it("should accept negative latitude and longitude", () => {
        const result = checkCommaFormat(["-33.8688, -70.6693", "-22.9068, -43.1729"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });

      it("should accept coordinates at boundary values", () => {
        const result = checkCommaFormat(["90, 180", "-90, -180"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });

      it("should handle a single valid sample", () => {
        const result = checkCommaFormat(["40.7128, -74.0060"]);
        expect(result).toEqual({ format: "combined_comma", confidence: 1.0 });
      });

      it("should reject when too many spaces after comma (more than 5)", () => {
        // The regex allows \s{0,5} after the comma
        const result = checkCommaFormat(["40.7128,      -74.0060"]);
        expect(result).toBeNull();
      });
    });
  });

  describe("checkSpaceFormat", () => {
    describe("valid detections", () => {
      it("should detect space-separated coordinates", () => {
        const result = checkSpaceFormat(["40.7128 -74.0060", "51.5074 -0.1278"]);
        expect(result).toEqual({ format: "combined_space", confidence: 1.0 });
      });

      it("should detect integer coordinates with space separator", () => {
        const result = checkSpaceFormat(["40 -74", "51 -1"]);
        expect(result).toEqual({ format: "combined_space", confidence: 1.0 });
      });

      it("should detect coordinates with multiple spaces", () => {
        const result = checkSpaceFormat(["40.7128  -74.0060", "51.5074   -0.1278"]);
        expect(result).toEqual({ format: "combined_space", confidence: 1.0 });
      });
    });

    describe("confidence threshold", () => {
      it("should detect when exactly 70% of samples match", () => {
        const samples = [
          "40.7128 -74.0060",
          "51.5074 -0.1278",
          "48.8566 2.3522",
          "35.6762 139.6503",
          "52.5200 13.4050",
          "-33.8688 151.2093",
          "55.7558 37.6173",
          "invalid",
          "invalid",
          "invalid",
        ];
        const result = checkSpaceFormat(samples);
        expect(result).not.toBeNull();
        expect(result!.format).toBe("combined_space");
        expect(result!.confidence).toBeCloseTo(0.7, 5);
      });

      it("should return null when below 70% threshold", () => {
        const samples = [
          "40.7128 -74.0060",
          "51.5074 -0.1278",
          "invalid",
          "invalid",
          "invalid",
          "invalid",
          "invalid",
          "invalid",
          "invalid",
          "invalid",
        ];
        const result = checkSpaceFormat(samples);
        expect(result).toBeNull();
      });
    });

    describe("invalid inputs", () => {
      it("should return null for empty array", () => {
        const result = checkSpaceFormat([]);
        expect(result).toBeNull();
      });

      it("should return null for comma-separated coordinates", () => {
        const result = checkSpaceFormat(["40.7128, -74.0060", "51.5074, -0.1278"]);
        expect(result).toBeNull();
      });

      it("should return null for plain text", () => {
        const result = checkSpaceFormat(["hello world", "foo bar"]);
        expect(result).toBeNull();
      });

      it("should return null for null and undefined values", () => {
        const result = checkSpaceFormat([null, undefined]);
        expect(result).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should reject coordinates out of valid range", () => {
        const result = checkSpaceFormat(["91.0 200.0", "100.0 -200.0"]);
        expect(result).toBeNull();
      });

      it("should accept negative coordinates", () => {
        const result = checkSpaceFormat(["-33.8688 151.2093", "-22.9068 -43.1729"]);
        expect(result).toEqual({ format: "combined_space", confidence: 1.0 });
      });

      it("should accept boundary values", () => {
        const result = checkSpaceFormat(["90 180", "-90 -180"]);
        expect(result).toEqual({ format: "combined_space", confidence: 1.0 });
      });

      it("should handle a single valid sample", () => {
        const result = checkSpaceFormat(["40.7128 -74.0060"]);
        expect(result).toEqual({ format: "combined_space", confidence: 1.0 });
      });

      it("should reject when too many spaces (more than 5)", () => {
        // The regex allows \s{1,5} between values
        const result = checkSpaceFormat(["40.7128      -74.0060"]);
        expect(result).toBeNull();
      });

      it("should handle number inputs", () => {
        // A number like 40.7128 becomes "40.7128" which does not have a space
        const result = checkSpaceFormat([40.7128, 51.5074]);
        expect(result).toBeNull();
      });
    });
  });

  describe("checkGeoJsonFormat", () => {
    describe("valid detections", () => {
      it("should detect GeoJSON Point strings", () => {
        const result = checkGeoJsonFormat([
          '{"type": "Point", "coordinates": [-74.0060, 40.7128]}',
          '{"type": "Point", "coordinates": [-0.1278, 51.5074]}',
        ]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });

      it("should detect GeoJSON Point objects (pre-parsed)", () => {
        const result = checkGeoJsonFormat([
          { type: "Point", coordinates: [-74.006, 40.7128] },
          { type: "Point", coordinates: [-0.1278, 51.5074] },
        ]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });

      it("should detect mixed strings and objects", () => {
        const result = checkGeoJsonFormat([
          '{"type": "Point", "coordinates": [-74.0060, 40.7128]}',
          { type: "Point", coordinates: [-0.1278, 51.5074] },
        ]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });

      it("should handle GeoJSON with extra properties", () => {
        const result = checkGeoJsonFormat([{ type: "Point", coordinates: [-74.006, 40.7128], crs: "EPSG:4326" }]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });
    });

    describe("confidence threshold", () => {
      it("should detect when exactly 70% of samples match", () => {
        const samples = [
          { type: "Point", coordinates: [-74.006, 40.7128] },
          { type: "Point", coordinates: [-0.1278, 51.5074] },
          { type: "Point", coordinates: [2.3522, 48.8566] },
          { type: "Point", coordinates: [139.6503, 35.6762] },
          { type: "Point", coordinates: [13.405, 52.52] },
          { type: "Point", coordinates: [151.2093, -33.8688] },
          { type: "Point", coordinates: [37.6173, 55.7558] },
          "not geojson",
          "invalid",
          null,
        ];
        const result = checkGeoJsonFormat(samples);
        expect(result).not.toBeNull();
        expect(result!.format).toBe("geojson");
        expect(result!.confidence).toBeCloseTo(0.7, 5);
      });

      it("should return null when below 70% threshold", () => {
        const samples = [{ type: "Point", coordinates: [-74.006, 40.7128] }, "not geojson", "invalid", null, 42];
        const result = checkGeoJsonFormat(samples);
        expect(result).toBeNull();
      });
    });

    describe("invalid inputs", () => {
      it("should return null for empty array", () => {
        const result = checkGeoJsonFormat([]);
        expect(result).toBeNull();
      });

      it("should return null for plain strings", () => {
        const result = checkGeoJsonFormat(["hello", "world"]);
        expect(result).toBeNull();
      });

      it("should return null for invalid JSON strings", () => {
        const result = checkGeoJsonFormat(["{not valid json}", "{{bad}}"]);
        expect(result).toBeNull();
      });

      it("should return null for non-Point GeoJSON types", () => {
        const result = checkGeoJsonFormat([
          {
            type: "LineString",
            coordinates: [
              [-74, 40],
              [-73, 41],
            ],
          },
          {
            type: "Polygon",
            coordinates: [
              [
                [-74, 40],
                [-73, 41],
                [-72, 40],
                [-74, 40],
              ],
            ],
          },
        ]);
        expect(result).toBeNull();
      });

      it("should return null for GeoJSON Point with missing coordinates", () => {
        const result = checkGeoJsonFormat([{ type: "Point" }, { type: "Point" }]);
        expect(result).toBeNull();
      });

      it("should return null for GeoJSON Point with empty coordinates", () => {
        const result = checkGeoJsonFormat([
          { type: "Point", coordinates: [] },
          { type: "Point", coordinates: [] },
        ]);
        expect(result).toBeNull();
      });

      it("should return null for GeoJSON Point with only one coordinate", () => {
        const result = checkGeoJsonFormat([
          { type: "Point", coordinates: [-74.006] },
          { type: "Point", coordinates: [40.7128] },
        ]);
        expect(result).toBeNull();
      });

      it("should return null for null and undefined values", () => {
        const result = checkGeoJsonFormat([null, undefined]);
        expect(result).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should reject GeoJSON with out-of-range coordinates", () => {
        const result = checkGeoJsonFormat([
          { type: "Point", coordinates: [200, 100] },
          { type: "Point", coordinates: [-200, -100] },
        ]);
        expect(result).toBeNull();
      });

      it("should reject GeoJSON with near-null-island coordinates", () => {
        const result = checkGeoJsonFormat([
          { type: "Point", coordinates: [0.001, 0.001] },
          { type: "Point", coordinates: [0.005, 0.005] },
        ]);
        expect(result).toBeNull();
      });

      it("should use GeoJSON coordinate order (lon, lat)", () => {
        // GeoJSON uses [longitude, latitude]
        const result = checkGeoJsonFormat([{ type: "Point", coordinates: [-74.006, 40.7128] }]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });

      it("should handle a single valid GeoJSON sample", () => {
        const result = checkGeoJsonFormat([{ type: "Point", coordinates: [-74.006, 40.7128] }]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });

      it("should accept GeoJSON with extra coordinates (3D)", () => {
        // GeoJSON allows optional altitude as third coordinate
        const result = checkGeoJsonFormat([
          { type: "Point", coordinates: [-74.006, 40.7128, 100] },
          { type: "Point", coordinates: [-0.1278, 51.5074, 50] },
        ]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });

      it("should accept boundary coordinate values", () => {
        const result = checkGeoJsonFormat([
          { type: "Point", coordinates: [180, 90] },
          { type: "Point", coordinates: [-180, -90] },
        ]);
        expect(result).toEqual({ format: "geojson", confidence: 1.0 });
      });
    });
  });

  describe("cross-format discrimination", () => {
    it("should not confuse comma format with space format", () => {
      const commaSamples = ["40.7128, -74.0060", "51.5074, -0.1278"];
      expect(checkCommaFormat(commaSamples)).not.toBeNull();
      expect(checkSpaceFormat(commaSamples)).toBeNull();
    });

    it("should not confuse space format with comma format", () => {
      const spaceSamples = ["40.7128 -74.0060", "51.5074 -0.1278"];
      expect(checkSpaceFormat(spaceSamples)).not.toBeNull();
      expect(checkCommaFormat(spaceSamples)).toBeNull();
    });

    it("should not confuse GeoJSON with comma or space format", () => {
      const geoJsonSamples = [
        '{"type": "Point", "coordinates": [-74.0060, 40.7128]}',
        '{"type": "Point", "coordinates": [-0.1278, 51.5074]}',
      ];
      expect(checkGeoJsonFormat(geoJsonSamples)).not.toBeNull();
      expect(checkCommaFormat(geoJsonSamples)).toBeNull();
      expect(checkSpaceFormat(geoJsonSamples)).toBeNull();
    });
  });
});
