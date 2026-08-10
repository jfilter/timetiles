/**
 * Unit tests for preview-schema helper functions.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

vi.mock("@/lib/api", () => ({ ValidationError: class ValidationError extends Error {} }));

// Only language detection is stubbed (for determinism) — the header matcher stays real so
// these tests cover the actual detection rules rather than a stand-in.
vi.mock("@/lib/services/schema-detection", async (importOriginal) => ({
  ...(await importOriginal<typeof SchemaDetection>()),
  detectLanguage: vi.fn().mockReturnValue({ code: "eng", confidence: 0.9 }),
}));

import { detectSuggestedMappings, parseCSVPreview } from "@/app/api/ingest/preview-schema/helpers";
import type * as SchemaDetection from "@/lib/services/schema-detection";

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

  it("detects the common English header names", () => {
    const headers = ["title", "description", "date", "location", "url"];
    const rows = [{ title: "A", description: "B", date: "2026-01-01", location: "Berlin", url: "https://x" }];

    const suggestions = detectSuggestedMappings(headers, rows);

    expect(suggestions.mappings.titlePath.path).toBe("title");
    expect(suggestions.mappings.descriptionPath.path).toBe("description");
    expect(suggestions.mappings.timestampPath.path).toBe("date");
    expect(suggestions.mappings.locationNamePath.path).toBe("location");
  });

  it("matches headers regardless of case", () => {
    const headers = ["TITLE", "Description", "START_DATE", "LOCATION"];
    const rows = [{ TITLE: "A", Description: "B", START_DATE: "2026-01-01", LOCATION: "Berlin" }];

    const suggestions = detectSuggestedMappings(headers, rows);

    // The original spelling is returned — the path has to address the real column.
    expect(suggestions.mappings.titlePath.path).toBe("TITLE");
    expect(suggestions.mappings.descriptionPath.path).toBe("Description");
    expect(suggestions.mappings.locationNamePath.path).toBe("LOCATION");
  });

  it("prefers the exact header over a partial match", () => {
    const headers = ["event_title", "title"];
    const rows = [{ event_title: "A", title: "B" }];

    const suggestions = detectSuggestedMappings(headers, rows);

    expect(suggestions.mappings.titlePath.path).toBe("title");
  });
});

describe("parseCSVPreview", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("keeps CSV preview values as raw strings", () => {
    tempDir = mkdtempSync(join(tmpdir(), "preview-schema-"));
    const filePath = join(tempDir, "events.csv");
    writeFileSync(filePath, "external_id,count,active\n00123,42,true\n123,7,false\n", "utf-8");

    const [sheet] = parseCSVPreview(filePath);

    expect(sheet?.rowCount).toBe(2);
    expect(sheet?.sampleData[0]).toMatchObject({ external_id: "00123", count: "42", active: "true" });
    expect(sheet?.sampleData[1]).toMatchObject({ external_id: "123" });
  });
});
