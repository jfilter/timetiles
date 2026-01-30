/**
 * Unit tests for relationship configuration.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { getRelationshipConfig, RELATIONSHIP_CONFIG, validateRelationshipConfig } from "@/lib/seed/relationship-config";

describe("relationship-config", () => {
  describe("getRelationshipConfig", () => {
    it("should return config for known collection", () => {
      const config = getRelationshipConfig("datasets");
      expect(config).toHaveLength(1);
      expect(config[0]!.field).toBe("catalog");
      expect(config[0]!.targetCollection).toBe("catalogs");
    });

    it("should return empty array for unknown collection", () => {
      expect(getRelationshipConfig("unknown")).toEqual([]);
    });

    it("should return events config with dataset relationship", () => {
      const config = getRelationshipConfig("events");
      expect(config).toHaveLength(1);
      expect(config[0]!.field).toBe("dataset");
    });
  });

  describe("validateRelationshipConfig", () => {
    it("should not throw for valid config", () => {
      expect(() => validateRelationshipConfig()).not.toThrow();
    });
  });

  describe("transform functions", () => {
    it("should map known catalog slugs to names", () => {
      const config = RELATIONSHIP_CONFIG.datasets![0]!;
      expect(config.transform!("test-catalog")).toBe("Test Catalog");
      expect(config.transform!("environmental-data")).toBe("Environmental Data");
    });

    it("should pass through unknown values", () => {
      const config = RELATIONSHIP_CONFIG.datasets![0]!;
      expect(config.transform!("My Custom Catalog")).toBe("My Custom Catalog");
    });

    it("should map known dataset slugs to names", () => {
      const config = RELATIONSHIP_CONFIG.events![0]!;
      expect(config.transform!("air-quality")).toBe("Air Quality Measurements");
    });
  });
});
