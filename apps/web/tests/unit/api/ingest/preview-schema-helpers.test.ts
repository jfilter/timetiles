/**
 * Unit tests for preview-schema helper functions.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ ValidationError: class ValidationError extends Error {} }));

vi.mock("@/lib/services/schema-detection", () => ({
  detectLanguage: vi.fn().mockReturnValue({ code: "eng", confidence: 0.9 }),
  LATITUDE_PATTERNS: [/^lat$/i, /^latitude$/i],
  LONGITUDE_PATTERNS: [/^lng$/i, /^longitude$/i],
  matchFieldNamePatterns: vi.fn().mockReturnValue(null),
}));

import { detectSuggestedMappings } from "@/app/api/ingest/preview-schema/helpers";

describe("detectSuggestedMappings", () => {
  it("uses whole-file rows for paired date inference, not just preview samples", () => {
    const headers = ["phase_one", "phase_two", "title"];
    const sampleData = [
      { phase_one: "not-a-date", phase_two: "still-not-a-date", title: "Preview row" },
      { phase_one: "", phase_two: "", title: "Preview row 2" },
    ];
    const allRows = [
      ...sampleData,
      { phase_one: "2026-05-01", phase_two: "2026-05-02", title: "Event A" },
      { phase_one: "2026-06-03", phase_two: "2026-06-04", title: "Event B" },
      { phase_one: "2026-07-05", phase_two: "2026-07-06", title: "Event C" },
    ];

    const suggestions = detectSuggestedMappings(headers, sampleData, allRows);

    expect(suggestions.mappings.timestampPath.path).toBe("phase_one");
    expect(suggestions.mappings.endTimestampPath.path).toBe("phase_two");
    expect(suggestions.mappings.endTimestampPath.confidenceLevel).not.toBe("none");
  });
});
