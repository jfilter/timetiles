/**
 * Unit tests for data export formatting utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { getExportDownloadUrl } from "@/lib/export/formatting";

describe("Export Formatting Utilities", () => {
  describe("getExportDownloadUrl", () => {
    it("returns the correct download URL for a given export ID", () => {
      expect(getExportDownloadUrl(42)).toBe("/api/data-exports/42/download");
    });

    it("handles single-digit IDs", () => {
      expect(getExportDownloadUrl(1)).toBe("/api/data-exports/1/download");
    });

    it("handles large IDs", () => {
      expect(getExportDownloadUrl(999999)).toBe("/api/data-exports/999999/download");
    });
  });
});
