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
      // A detected format always reports { format: "combined_comma", confidence: 1.0 } here;
      // null means the samples did not match. Bare numbers are stringified via String(s),
      // so 40.7128 becomes "40.7128" — no comma, no match.
      it.each([
        ["comma-separated coordinates with spaces", ["40.7128, -74.0060", "51.5074, -0.1278"], true],
        ["comma-separated coordinates without spaces", ["40.7128,-74.0060", "51.5074,-0.1278"], true],
        ["integer coordinates", ["40, -74", "51, -1"], true],
        ["coordinates with multiple spaces after comma", ["40.7128,  -74.0060", "51.5074,   -0.1278"], true],
        ["number inputs (stringified, no comma)", [40.7128, 51.5074], false],
      ])("%s", (_name, samples, detected) => {
        const result = checkCommaFormat(samples);
        expect(result).toEqual(detected ? { format: "combined_comma", confidence: 1.0 } : null);
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

    describe("invalid inputs and edge cases", () => {
      // Rejection reasons worth remembering: an empty array yields 0/0 = NaN (not >= 0.7);
      // isValidCoordinate rejects coordinates within ~0.01 of (0,0) (null island);
      // the regex allows at most \s{0,5} after the comma.
      it.each([
        ["empty array", [], false],
        ["non-coordinate strings", ["hello, world", "foo, bar"], false],
        ["space-separated coordinates", ["40.7128 -74.0060", "51.5074 -0.1278"], false],
        ["null and undefined values", [null, undefined, null], false],
        ["boolean values", [true, false, true], false],
        ["object values", [{ lat: 40 }, { lat: 51 }], false],
        ["coordinates out of valid range", ["91.0, -74.0060", "100.0, -181.0"], false],
        ["near-null-island coordinates", ["0.001, 0.001", "0.005, 0.005"], false],
        ["negative latitude and longitude", ["-33.8688, -70.6693", "-22.9068, -43.1729"], true],
        ["coordinates at boundary values", ["90, 180", "-90, -180"], true],
        ["a single valid sample", ["40.7128, -74.0060"], true],
        ["too many spaces after comma (more than 5)", ["40.7128,      -74.0060"], false],
      ])("%s", (_name, samples, detected) => {
        const result = checkCommaFormat(samples);
        expect(result).toEqual(detected ? { format: "combined_comma", confidence: 1.0 } : null);
      });
    });
  });

  describe("checkSpaceFormat", () => {
    describe("valid detections", () => {
      it.each([
        ["space-separated coordinates", ["40.7128 -74.0060", "51.5074 -0.1278"]],
        ["integer coordinates with space separator", ["40 -74", "51 -1"]],
        ["coordinates with multiple spaces", ["40.7128  -74.0060", "51.5074   -0.1278"]],
      ])("%s", (_name, samples) => {
        const result = checkSpaceFormat(samples);
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

    describe("invalid inputs and edge cases", () => {
      // The regex allows \s{1,5} between values; bare numbers are stringified
      // via String(s), so 40.7128 becomes "40.7128" — no space, no match.
      it.each([
        ["empty array", [], false],
        ["comma-separated coordinates", ["40.7128, -74.0060", "51.5074, -0.1278"], false],
        ["plain text", ["hello world", "foo bar"], false],
        ["null and undefined values", [null, undefined], false],
        ["coordinates out of valid range", ["91.0 200.0", "100.0 -200.0"], false],
        ["negative coordinates", ["-33.8688 151.2093", "-22.9068 -43.1729"], true],
        ["boundary values", ["90 180", "-90 -180"], true],
        ["a single valid sample", ["40.7128 -74.0060"], true],
        ["too many spaces (more than 5)", ["40.7128      -74.0060"], false],
        ["number inputs (stringified, no space)", [40.7128, 51.5074], false],
      ])("%s", (_name, samples, detected) => {
        const result = checkSpaceFormat(samples);
        expect(result).toEqual(detected ? { format: "combined_space", confidence: 1.0 } : null);
      });
    });
  });

  describe("checkGeoJsonFormat", () => {
    describe("valid detections", () => {
      it.each([
        [
          "GeoJSON Point strings",
          [
            '{"type": "Point", "coordinates": [-74.0060, 40.7128]}',
            '{"type": "Point", "coordinates": [-0.1278, 51.5074]}',
          ],
        ],
        [
          "GeoJSON Point objects (pre-parsed)",
          [
            { type: "Point", coordinates: [-74.006, 40.7128] },
            { type: "Point", coordinates: [-0.1278, 51.5074] },
          ],
        ],
        [
          "mixed strings and objects",
          ['{"type": "Point", "coordinates": [-74.0060, 40.7128]}', { type: "Point", coordinates: [-0.1278, 51.5074] }],
        ],
        ["GeoJSON with extra properties", [{ type: "Point", coordinates: [-74.006, 40.7128], crs: "EPSG:4326" }]],
      ])("%s", (_name, samples) => {
        const result = checkGeoJsonFormat(samples);
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
      it.each([
        ["empty array", []],
        ["plain strings", ["hello", "world"]],
        ["invalid JSON strings", ["{not valid json}", "{{bad}}"]],
        [
          "non-Point GeoJSON types",
          [
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
          ],
        ],
        ["GeoJSON Point with missing coordinates", [{ type: "Point" }, { type: "Point" }]],
        [
          "GeoJSON Point with empty coordinates",
          [
            { type: "Point", coordinates: [] },
            { type: "Point", coordinates: [] },
          ],
        ],
        [
          "GeoJSON Point with only one coordinate",
          [
            { type: "Point", coordinates: [-74.006] },
            { type: "Point", coordinates: [40.7128] },
          ],
        ],
        ["null and undefined values", [null, undefined]],
      ])("returns null for %s", (_name, samples) => {
        expect(checkGeoJsonFormat(samples)).toBeNull();
      });
    });

    describe("edge cases", () => {
      // GeoJSON coordinate order is [longitude, latitude].
      it.each([
        [
          "rejects out-of-range coordinates",
          [
            { type: "Point", coordinates: [200, 100] },
            { type: "Point", coordinates: [-200, -100] },
          ],
          false,
        ],
        [
          "rejects near-null-island coordinates",
          [
            { type: "Point", coordinates: [0.001, 0.001] },
            { type: "Point", coordinates: [0.005, 0.005] },
          ],
          false,
        ],
        [
          "accepts a single valid sample in (lon, lat) order",
          [{ type: "Point", coordinates: [-74.006, 40.7128] }],
          true,
        ],
      ])("%s", (_name, samples, detected) => {
        const result = checkGeoJsonFormat(samples);
        expect(result).toEqual(detected ? { format: "geojson", confidence: 1.0 } : null);
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
