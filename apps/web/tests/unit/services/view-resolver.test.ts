/**
 * Unit tests for view resolver pure utility functions.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it } from "vitest";

import { extractViewSlugFromPath, getViewDataScopeFilter } from "@/lib/services/view-resolver";
import type { View } from "@/payload-types";

describe("view-resolver utilities", () => {
  describe("extractViewSlugFromPath", () => {
    it("should extract slug from /v/slug path", () => {
      expect(extractViewSlugFromPath("/v/city-events")).toBe("city-events");
    });

    it("should extract slug from nested path", () => {
      expect(extractViewSlugFromPath("/v/city-events/explore")).toBe("city-events");
    });

    it("should return null for non-view paths", () => {
      expect(extractViewSlugFromPath("/explore")).toBeNull();
      expect(extractViewSlugFromPath("/")).toBeNull();
      expect(extractViewSlugFromPath("/v/")).toBeNull();
    });
  });

  describe("getViewDataScopeFilter", () => {
    it("should return empty object for null view", () => {
      expect(getViewDataScopeFilter(null)).toEqual({});
    });

    it("should return empty object for view without dataScope", () => {
      expect(getViewDataScopeFilter({ dataScope: undefined } as unknown as View)).toEqual({});
    });

    it("should return catalogIds for catalogs mode", () => {
      const view = {
        dataScope: {
          mode: "catalogs" as const,
          catalogs: [1, 2, 3],
        },
      } as unknown as View;
      expect(getViewDataScopeFilter(view)).toEqual({ catalogIds: [1, 2, 3] });
    });

    it("should handle catalog objects with id property", () => {
      const view = {
        dataScope: {
          mode: "catalogs" as const,
          catalogs: [{ id: 1 }, { id: 2 }],
        },
      } as unknown as View;
      expect(getViewDataScopeFilter(view)).toEqual({ catalogIds: [1, 2] });
    });

    it("should return datasetIds for datasets mode", () => {
      const view = {
        dataScope: {
          mode: "datasets" as const,
          datasets: [10, 20],
        },
      } as unknown as View;
      expect(getViewDataScopeFilter(view)).toEqual({ datasetIds: [10, 20] });
    });

    it("should return empty object for all mode", () => {
      const view = {
        dataScope: {
          mode: "all" as const,
        },
      } as unknown as View;
      expect(getViewDataScopeFilter(view)).toEqual({});
    });

    it("should return empty object for empty catalogs array", () => {
      const view = {
        dataScope: {
          mode: "catalogs" as const,
          catalogs: [],
        },
      } as unknown as View;
      expect(getViewDataScopeFilter(view)).toEqual({});
    });

    it("should return empty object for empty datasets array", () => {
      const view = {
        dataScope: {
          mode: "datasets" as const,
          datasets: [],
        },
      } as unknown as View;
      expect(getViewDataScopeFilter(view)).toEqual({});
    });
  });
});
