/**
 * Unit tests for simple pattern generator.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { applySimplePatterns } from "@/lib/seed/generators/simple-patterns";

describe("applySimplePatterns", () => {
  it("should return empty array for empty input", () => {
    expect(applySimplePatterns([])).toEqual([]);
  });

  it("should pass through non-object values", () => {
    const result = applySimplePatterns([null, "string", 42], { seed: 1 });
    expect(result).toEqual([null, "string", 42]);
  });

  it("should vary title with index", () => {
    const events = [{ title: "Event" }, { title: "Event" }];
    const result = applySimplePatterns(events, { seed: 1 });
    expect((result[0] as any).title).toBe("Event 1");
    expect((result[1] as any).title).toBe("Event 2");
  });

  it("should vary eventTimestamp", () => {
    const events = [{ eventTimestamp: "2024-01-01T00:00:00Z" }];
    const result = applySimplePatterns(events, { seed: 1 });
    const ts = (result[0] as any).eventTimestamp;
    expect(ts).toBeInstanceOf(Date);
    expect(ts.getTime()).toBeGreaterThan(new Date("2024-01-01").getTime());
  });

  it("should vary geopoint coordinates", () => {
    const events = [{ geopoint: { type: "Point", coordinates: [13.4, 52.5] } }];
    const result = applySimplePatterns(events, { seed: 1 });
    const geopoint = (result[0] as any).geopoint;
    expect(geopoint.type).toBe("Point");
    expect(geopoint.coordinates[0]).toBeCloseTo(13.4, 0);
    expect(geopoint.coordinates[1]).toBeCloseTo(52.5, 0);
  });

  it("should handle Date objects for eventTimestamp", () => {
    const events = [{ eventTimestamp: new Date("2024-06-15") }];
    const result = applySimplePatterns(events, { seed: 1 });
    expect((result[0] as any).eventTimestamp).toBeInstanceOf(Date);
  });

  it("should produce deterministic output with same seed", () => {
    const events = [{ title: "Test", eventTimestamp: "2024-01-01T00:00:00Z" }];
    const r1 = applySimplePatterns(events, { seed: 42 });
    const r2 = applySimplePatterns(events, { seed: 42 });
    expect((r1[0] as any).eventTimestamp.getTime()).toBe((r2[0] as any).eventTimestamp.getTime());
  });
});
