/**
 * Regression tests for date-parse transform output.
 *
 * Split out of ingest-transforms.test.ts, which is at the 1000-line ceiling.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { applyTransforms } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";

describe("date-parse transform output", () => {
  it("honors every output format the transform editor offers, not just ISO", () => {
    // Every offered format must reach the output, not collapse to YYYY-MM-DD via toISOString().
    // A round-trip guard comparing FORMATTED output to the input would bail on every non-ISO
    // format for ISO input, the most common case (a CSV of ISO dates).
    const format = (outputFormat: string): unknown => {
      const transforms: IngestTransform[] = [
        {
          id: "1",
          type: "date-parse",
          from: "date",
          inputFormat: "YYYY-MM-DD",
          outputFormat,
          active: true,
          autoDetected: false,
        },
      ];
      return applyTransforms({ date: "2024-03-15" }, transforms).date;
    };

    expect(format("DD/MM/YYYY")).toBe("15/03/2024");
    expect(format("DD.MM.YYYY")).toBe("15.03.2024");
    expect(format("MM-DD-YYYY")).toBe("03-15-2024");
    expect(format("YYYY/MM/DD")).toBe("2024/03/15");
    expect(format("D MMMM YYYY")).toBe("15 March 2024");
    expect(format("MMMM D, YYYY")).toBe("March 15, 2024");
    expect(format("YYYY-MM-DD")).toBe("2024-03-15");
    expect(format("ISO 8601")).toBe("2024-03-15T00:00:00.000Z");
  });

  it("keeps the calendar date of the source timezone for date-only output", () => {
    // "2024-06-15 in Asia/Tokyo" is the instant 2024-06-14T15:00Z; reading its UTC parts
    // would move every imported date a day back for zones east of Greenwich.
    const withZone = (timezone: string): unknown => {
      const transforms: IngestTransform[] = [
        {
          id: "1",
          type: "date-parse",
          from: "date",
          inputFormat: "YYYY-MM-DD",
          outputFormat: "YYYY-MM-DD",
          timezone,
          active: true,
          autoDetected: false,
        },
      ];
      return applyTransforms({ date: "2024-06-15" }, transforms).date;
    };

    expect(withZone("Asia/Tokyo")).toBe("2024-06-15");
    expect(withZone("America/New_York")).toBe("2024-06-15");
  });
});
