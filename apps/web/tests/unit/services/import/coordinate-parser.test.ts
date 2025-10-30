/**
 * Unit tests for coordinate parsing utilities.
 *
 * Tests various coordinate formats including decimal degrees, DMS, and directional notations.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  parseCoordinate,
  parseDirectionalFormat,
  parseDMSFormat,
  tryParseDecimal,
} from "../../../../lib/services/import/coordinate-parser";

describe("Coordinate Parser Utilities", () => {
  describe("tryParseDecimal", () => {
    it("should parse valid decimal number", () => {
      expect(tryParseDecimal("40.7128")).toBe(40.7128);
      expect(tryParseDecimal("-74.0060")).toBe(-74.006);
    });

    it("should parse integer strings", () => {
      expect(tryParseDecimal("42")).toBe(42);
      expect(tryParseDecimal("-180")).toBe(-180);
    });

    it("should parse zero", () => {
      expect(tryParseDecimal("0")).toBe(0);
      expect(tryParseDecimal("0.0")).toBe(0);
    });

    it("should return null for non-numeric strings", () => {
      expect(tryParseDecimal("abc")).toBeNull();
      expect(tryParseDecimal("")).toBeNull();
      expect(tryParseDecimal("N/A")).toBeNull();
    });

    it("should parse scientific notation", () => {
      expect(tryParseDecimal("1.5e2")).toBe(150);
      expect(tryParseDecimal("-1.5e2")).toBe(-150);
    });

    it("should handle strings with leading/trailing spaces", () => {
      expect(tryParseDecimal("  42.5  ")).toBe(42.5);
    });
  });

  describe("parseDMSFormat", () => {
    it("should parse DMS with degree symbol", () => {
      const result = parseDMSFormat("40°26'46\"N");
      expect(result).toBeCloseTo(40.446111, 5);
    });

    it("should parse DMS with spaces", () => {
      const result = parseDMSFormat("40 26 46 N");
      expect(result).toBeCloseTo(40.446111, 5);
    });

    it("should parse DMS without direction", () => {
      const result = parseDMSFormat("40°26'46\"");
      expect(result).toBeCloseTo(40.446111, 5);
    });

    it("should handle South direction (negative)", () => {
      const result = parseDMSFormat("40°26'46\"S");
      expect(result).toBeCloseTo(-40.446111, 5);
    });

    it("should handle West direction (negative)", () => {
      const result = parseDMSFormat("74°0'21\"W");
      expect(result).toBeCloseTo(-74.005833, 5);
    });

    it("should handle East direction (positive)", () => {
      const result = parseDMSFormat("74°0'21\"E");
      expect(result).toBeCloseTo(74.005833, 5);
    });

    it("should parse DMS with decimal seconds", () => {
      const result = parseDMSFormat("40°26'46.5\"N");
      expect(result).toBeCloseTo(40.44625, 5);
    });

    it("should handle zero values", () => {
      expect(parseDMSFormat("0°0'0\"")).toBe(0);
    });

    it("should handle negative degrees", () => {
      // Negative degrees: -40 + 26/60 + 46/3600 = -40 + 0.433333 + 0.012778 = -39.553889
      const result = parseDMSFormat("-40°26'46\"");
      expect(result).toBeCloseTo(-39.553889, 5);
    });

    it("should return null for invalid format", () => {
      expect(parseDMSFormat("invalid")).toBeNull();
      expect(parseDMSFormat("40-26-46")).toBeNull();
      expect(parseDMSFormat("")).toBeNull();
    });

    it("should return null for incomplete DMS", () => {
      expect(parseDMSFormat("40°")).toBeNull();
      expect(parseDMSFormat("40°26'")).toBeNull();
    });

    it("should handle mixed case directions", () => {
      const resultN = parseDMSFormat("40°26'46\"n");
      const resultS = parseDMSFormat("40°26'46\"s");
      expect(resultN).toBeCloseTo(40.446111, 5);
      expect(resultS).toBeCloseTo(-40.446111, 5);
    });
  });

  describe("parseDirectionalFormat", () => {
    it("should parse decimal with North direction", () => {
      expect(parseDirectionalFormat("40.7128 N")).toBe(40.7128);
      expect(parseDirectionalFormat("40.7128N")).toBe(40.7128);
    });

    it("should parse decimal with South direction (negative)", () => {
      expect(parseDirectionalFormat("40.7128 S")).toBe(-40.7128);
      expect(parseDirectionalFormat("40.7128S")).toBe(-40.7128);
    });

    it("should parse decimal with East direction", () => {
      expect(parseDirectionalFormat("74.0060 E")).toBe(74.006);
      expect(parseDirectionalFormat("74.0060E")).toBe(74.006);
    });

    it("should parse decimal with West direction (negative)", () => {
      expect(parseDirectionalFormat("74.0060 W")).toBe(-74.006);
      expect(parseDirectionalFormat("74.0060W")).toBe(-74.006);
    });

    it("should handle integer values", () => {
      expect(parseDirectionalFormat("40 N")).toBe(40);
      expect(parseDirectionalFormat("180 W")).toBe(-180);
    });

    it("should handle mixed case directions", () => {
      expect(parseDirectionalFormat("40.7128 n")).toBe(40.7128);
      expect(parseDirectionalFormat("40.7128 s")).toBe(-40.7128);
    });

    it("should return null for invalid format", () => {
      expect(parseDirectionalFormat("invalid")).toBeNull();
      expect(parseDirectionalFormat("40.7128")).toBeNull();
      expect(parseDirectionalFormat("N 40.7128")).toBeNull();
      expect(parseDirectionalFormat("")).toBeNull();
    });

    it("should return null for missing parts", () => {
      expect(parseDirectionalFormat("N")).toBeNull();
      expect(parseDirectionalFormat(" S")).toBeNull();
    });
  });

  describe("parseCoordinate", () => {
    describe("decimal format", () => {
      it("should parse decimal degrees", () => {
        expect(parseCoordinate("40.7128")).toBe(40.7128);
        expect(parseCoordinate("-74.0060")).toBe(-74.006);
      });

      it("should parse integer coordinates", () => {
        expect(parseCoordinate("42")).toBe(42);
        expect(parseCoordinate("-180")).toBe(-180);
      });

      it("should parse number type directly", () => {
        expect(parseCoordinate(40.7128)).toBe(40.7128);
        expect(parseCoordinate(-74.006)).toBe(-74.006);
        expect(parseCoordinate(0)).toBe(0);
      });
    });

    describe("DMS format", () => {
      it("should parse DMS coordinates", () => {
        const result = parseCoordinate("40°26'46\"N");
        expect(result).toBeCloseTo(40.446111, 5);
      });

      it("should parse DMS with spaces", () => {
        const result = parseCoordinate("40 26 46 S");
        expect(result).toBeCloseTo(-40.446111, 5);
      });
    });

    describe("directional format", () => {
      it("should parse directional coordinates", () => {
        expect(parseCoordinate("40.7128 N")).toBe(40.7128);
        expect(parseCoordinate("74.0060 W")).toBe(-74.006);
      });
    });

    describe("null/invalid inputs", () => {
      it("should return null for null", () => {
        expect(parseCoordinate(null)).toBeNull();
      });

      it("should return null for undefined", () => {
        expect(parseCoordinate(undefined)).toBeNull();
      });

      it("should return null for empty string", () => {
        expect(parseCoordinate("")).toBeNull();
      });

      it("should return null for invalid string", () => {
        expect(parseCoordinate("invalid")).toBeNull();
        expect(parseCoordinate("N/A")).toBeNull();
        expect(parseCoordinate("abc123")).toBeNull();
      });

      it("should return null for whitespace-only string", () => {
        expect(parseCoordinate("   ")).toBeNull();
      });
    });

    describe("special types", () => {
      it("should handle boolean values", () => {
        // Booleans are converted to strings: "true" and "false", which don't parse as numbers
        expect(parseCoordinate(true)).toBeNull();
        expect(parseCoordinate(false)).toBeNull();
      });

      it("should handle object values", () => {
        // Objects get converted to JSON string, which won't parse as coordinate
        expect(parseCoordinate({ lat: 40 })).toBeNull();
      });

      it("should handle array values", () => {
        // Arrays get converted to JSON string, which won't parse as coordinate
        expect(parseCoordinate([40, -74])).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should handle zero", () => {
        expect(parseCoordinate(0)).toBe(0);
        expect(parseCoordinate("0")).toBe(0);
        expect(parseCoordinate("0.0")).toBe(0);
      });

      it("should handle very small numbers", () => {
        expect(parseCoordinate("0.000001")).toBe(0.000001);
        expect(parseCoordinate(0.000001)).toBe(0.000001);
      });

      it("should handle very large numbers", () => {
        expect(parseCoordinate("180")).toBe(180);
        expect(parseCoordinate("-180")).toBe(-180);
      });

      it("should handle strings with extra whitespace", () => {
        expect(parseCoordinate("  40.7128  ")).toBe(40.7128);
        expect(parseCoordinate("\t42.5\n")).toBe(42.5);
      });
    });
  });
});
