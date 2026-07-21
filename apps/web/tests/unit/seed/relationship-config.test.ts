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
      validateRelationshipConfig();

      expect(Object.keys(RELATIONSHIP_CONFIG)).toContain("datasets");
      expect(Object.keys(RELATIONSHIP_CONFIG)).toContain("events");
    });

    it("should throw for config missing required fields", () => {
      // Temporarily add an invalid config entry
      const original = RELATIONSHIP_CONFIG["_test_invalid"];
      RELATIONSHIP_CONFIG["_test_invalid"] = [
        { field: "", targetCollection: "catalogs", searchField: "name" },
        { field: "catalog", targetCollection: "", searchField: "name" },
        { field: "catalog", targetCollection: "catalogs", searchField: "" },
      ];
      try {
        expect(() => validateRelationshipConfig()).toThrow("Invalid relationship configuration");
      } finally {
        delete RELATIONSHIP_CONFIG["_test_invalid"];
        // Restore if it existed before
        if (original !== undefined) {
          RELATIONSHIP_CONFIG["_test_invalid"] = original;
        }
      }
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

    it("resolves events by the unique dataset slug, with no name transform", () => {
      // Events must NOT be resolved by dataset `name`. Names come from shared
      // templates, so several catalogs produce datasets with the same one
      // ("Research Study Results" exists three times); resolving by name with
      // limit:1 attached a catalog's events to another catalog's dataset. The
      // slug is `${catalog.slug}-${template.slug}` and is genuinely unique.
      //
      // The transform this used to assert mapped slugs INTO those ambiguous
      // names — it converted the unique key into the broken one, so it is gone.
      const config = RELATIONSHIP_CONFIG.events![0]!;

      expect(config.searchField).toBe("slug");
      expect(config.fallbackSearch).toBe("name");
      expect(config.transform).toBeUndefined();
    });

    it("should map additional catalog slugs to names", () => {
      const config = RELATIONSHIP_CONFIG.datasets![0]!;
      expect(config.transform!("economic-indicators")).toBe("Economic Indicators");
      expect(config.transform!("cultural-events")).toBe("Cultural Events");
      expect(config.transform!("academic-research")).toBe("Academic Research");
      expect(config.transform!("government-data")).toBe("Government Data");
    });
  });
});
