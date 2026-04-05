/**
 * Unit tests for JSON record pre-processing (group-by with date merge).
 *
 * @module
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it } from "vitest";

import { type PreProcessingConfig, preProcessRecords } from "@/lib/ingest/pre-process-records";

const config: PreProcessingConfig = { groupBy: "uid", mergeFields: { startDate: "min", endDate: "max" } };

describe("preProcessRecords", () => {
  it("should return records unchanged when no config", () => {
    const records = [{ uid: 1, title: "A" }];
    expect(preProcessRecords(records, null)).toEqual(records);
    expect(preProcessRecords(records)).toEqual(records);
  });

  it("should return empty array for empty input", () => {
    expect(preProcessRecords([], config)).toEqual([]);
  });

  it("should pass through unique records unchanged", () => {
    const records = [
      { uid: 1, title: "A", startDate: "2024-06-01 10:00:00", endDate: "2024-06-01 18:00:00" },
      { uid: 2, title: "B", startDate: "2024-06-02 10:00:00", endDate: "2024-06-02 18:00:00" },
    ];
    const result = preProcessRecords(records, config);
    expect(result).toHaveLength(2);
  });

  it("should group by key and merge date fields with min/max", () => {
    const records = [
      { uid: 1, title: "Exhibition", startDate: "2024-06-01 11:00:00", endDate: "2024-06-01 18:00:00" },
      { uid: 1, title: "Exhibition", startDate: "2024-06-02 11:00:00", endDate: "2024-06-02 18:00:00" },
      { uid: 1, title: "Exhibition", startDate: "2024-06-03 11:00:00", endDate: "2024-06-03 18:00:00" },
    ];

    const result = preProcessRecords(records, config);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Exhibition");
    expect(result[0]!.startDate).toBe("2024-06-01 11:00:00");
    expect(result[0]!.endDate).toBe("2024-06-03 18:00:00");
  });

  it("should preserve non-merged fields from first record", () => {
    const records = [
      { uid: 1, title: "A", location: "Berlin", startDate: "2024-06-02 10:00:00", endDate: "2024-06-02 18:00:00" },
      { uid: 1, title: "A", location: "Berlin", startDate: "2024-06-01 10:00:00", endDate: "2024-06-01 18:00:00" },
    ];

    const result = preProcessRecords(records, config);

    expect(result).toHaveLength(1);
    expect(result[0]!.location).toBe("Berlin");
    expect(result[0]!.startDate).toBe("2024-06-01 10:00:00");
    expect(result[0]!.endDate).toBe("2024-06-02 18:00:00");
  });

  it("should handle mixed groups", () => {
    const records = [
      { uid: 1, title: "A", startDate: "2024-06-01 10:00:00", endDate: "2024-06-01 18:00:00" },
      { uid: 2, title: "B", startDate: "2024-07-01 10:00:00", endDate: "2024-07-01 18:00:00" },
      { uid: 1, title: "A", startDate: "2024-06-02 10:00:00", endDate: "2024-06-02 18:00:00" },
    ];

    const result = preProcessRecords(records, config);

    expect(result).toHaveLength(2);
    const eventA = result.find((r) => r.uid === 1);
    const eventB = result.find((r) => r.uid === 2);
    expect(eventA!.startDate).toBe("2024-06-01 10:00:00");
    expect(eventA!.endDate).toBe("2024-06-02 18:00:00");
    expect(eventB!.startDate).toBe("2024-07-01 10:00:00");
  });

  it("should handle single-record groups without merging", () => {
    const records = [{ uid: 1, title: "Solo", startDate: "2024-06-01 10:00:00", endDate: "2024-06-01 18:00:00" }];

    const result = preProcessRecords(records, config);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(records[0]); // Same reference — no clone needed
  });

  it("should handle records with missing groupBy field", () => {
    const records = [
      { title: "No UID", startDate: "2024-06-01 10:00:00", endDate: "2024-06-01 18:00:00" },
      { uid: 1, title: "Has UID", startDate: "2024-06-01 10:00:00", endDate: "2024-06-01 18:00:00" },
    ];

    const result = preProcessRecords(records, config);
    // Record without uid is skipped (empty key), only uid=1 survives
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Has UID");
  });

  it("should handle ISO date format", () => {
    const records = [
      { uid: 1, startDate: "2024-06-01T10:00:00Z", endDate: "2024-06-01T18:00:00Z" },
      { uid: 1, startDate: "2024-06-03T10:00:00Z", endDate: "2024-06-03T18:00:00Z" },
    ];

    const result = preProcessRecords(records, config);

    expect(result).toHaveLength(1);
    // ISO format preserved
    expect(result[0]!.startDate).toContain("2024-06-01");
    expect(result[0]!.endDate).toContain("2024-06-03");
  });
});
