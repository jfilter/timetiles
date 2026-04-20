/**
 * Unit tests for paired start/end date inference.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it } from "vitest";

import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { createPairedDateInference } from "@/lib/services/schema-detection/utilities/date-pairs";

const buildFieldStats = (rows: Record<string, unknown>[]) => {
  const builder = new ProgressiveSchemaBuilder();
  builder.processBatch(rows);
  return builder.getFieldStatistics();
};

describe("createPairedDateInference", () => {
  it("infers a generic start/end pair from whole-row ordering", () => {
    const headers = ["opens_on", "closes_on", "title"];
    const rows = [
      { opens_on: "2026-05-01", closes_on: "2026-05-02", title: "Event A" },
      { opens_on: "2026-06-03", closes_on: "2026-06-04", title: "Event B" },
      { opens_on: "2026-07-05", closes_on: "2026-07-06", title: "Event C" },
    ];

    const inference = createPairedDateInference({ headers, fieldStats: buildFieldStats(rows) });
    inference.processRows(rows);

    expect(inference.getResult()).toMatchObject({ timestampPath: "opens_on", endTimestampPath: "closes_on" });
  });

  it("keeps an explicit end-date mapping and fills the missing start partner", () => {
    const headers = ["window_start", "end_date", "title"];
    const rows = [
      { window_start: "2026-05-01", end_date: "2026-05-02", title: "Event A" },
      { window_start: "2026-06-03", end_date: "2026-06-04", title: "Event B" },
      { window_start: "2026-07-05", end_date: "2026-07-06", title: "Event C" },
    ];

    const inference = createPairedDateInference({
      headers,
      fieldStats: buildFieldStats(rows),
      existingMappings: { endTimestampPath: "end_date" },
    });
    inference.processRows(rows);

    expect(inference.getResult()).toMatchObject({ timestampPath: "window_start", endTimestampPath: "end_date" });
  });

  it("chooses the strongest qualifying pair when multiple date columns exist", () => {
    const headers = ["created_at", "window_start", "window_end", "title"];
    const rows = [
      { created_at: "2026-01-01", window_start: "2026-05-01", window_end: "2026-05-03", title: "Event A" },
      { created_at: "2026-01-02", window_start: "2026-06-01", window_end: "2026-06-03", title: "Event B" },
      { created_at: null, window_start: "2026-07-01", window_end: "2026-07-02", title: "Event C" },
      { created_at: null, window_start: "2026-08-01", window_end: "2026-08-02", title: "Event D" },
    ];

    const inference = createPairedDateInference({ headers, fieldStats: buildFieldStats(rows) });
    inference.processRows(rows);

    expect(inference.getResult()).toMatchObject({ timestampPath: "window_start", endTimestampPath: "window_end" });
  });

  it("does not infer a pair when row ordering is contradictory", () => {
    const headers = ["phase_one", "phase_two"];
    const rows = [
      { phase_one: "2026-05-03", phase_two: "2026-05-01" },
      { phase_one: "2026-06-01", phase_two: "2026-06-03" },
      { phase_one: "2026-07-04", phase_two: "2026-07-02" },
    ];

    const inference = createPairedDateInference({ headers, fieldStats: buildFieldStats(rows) });
    inference.processRows(rows);

    expect(inference.getResult()).toBeNull();
  });

  it("can select a non-adjacent pair when it is the best valid match", () => {
    const headers = ["created_at", "notes", "event_start", "venue", "event_end"];
    const rows = [
      { created_at: "2026-01-01", notes: "alpha", event_start: "2026-05-01", venue: "Hall A", event_end: "2026-05-02" },
      { created_at: "2026-01-02", notes: "beta", event_start: "2026-06-01", venue: "Hall B", event_end: "2026-06-02" },
      { created_at: null, notes: "gamma", event_start: "2026-07-01", venue: "Hall C", event_end: "2026-07-02" },
    ];

    const inference = createPairedDateInference({ headers, fieldStats: buildFieldStats(rows) });
    inference.processRows(rows);

    expect(inference.getResult()).toMatchObject({ timestampPath: "event_start", endTimestampPath: "event_end" });
  });

  it("does not let structurally unique date columns get excluded as id fields", () => {
    const headers = ["phase_one", "phase_two", "title"];
    const rows = [
      { phase_one: "2026-05-01", phase_two: "2026-05-02", title: "Event A" },
      { phase_one: "2026-06-03", phase_two: "2026-06-04", title: "Event B" },
      { phase_one: "2026-07-05", phase_two: "2026-07-06", title: "Event C" },
    ];

    const inference = createPairedDateInference({
      headers,
      fieldStats: buildFieldStats(rows),
      idFields: ["phase_one", "phase_two"],
    });
    inference.processRows(rows);

    expect(inference.getResult()).toMatchObject({ timestampPath: "phase_one", endTimestampPath: "phase_two" });
  });
});
