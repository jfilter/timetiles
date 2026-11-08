/**
 * Unit tests for deriving an ingest run's outcome from its sheets.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { deriveRunOutcome } from "@/lib/jobs/utils/reconcile-run";

const sheets = (...stages: string[]) => stages.map((stage) => ({ stage }) as { stage: never });

describe("deriveRunOutcome", () => {
  it("stays open while any sheet is in flight", () => {
    expect(deriveRunOutcome(2, sheets("completed", "geocode-batch"))).toBeNull();
    expect(deriveRunOutcome(2, sheets("failed", "analyze-duplicates"))).toBeNull();
  });

  it("completes when every sheet completed", () => {
    expect(deriveRunOutcome(2, sheets("completed", "completed"))).toBe("completed");
  });

  it("fails when any sheet failed, even next to a completed or reviewed one", () => {
    expect(deriveRunOutcome(2, sheets("completed", "failed"))).toBe("failed");
    expect(deriveRunOutcome(2, sheets("needs-review", "failed"))).toBe("failed");
  });

  it("awaits review when a sheet awaits review and none failed", () => {
    expect(deriveRunOutcome(2, sheets("completed", "needs-review"))).toBe("awaiting_review");
  });

  it("fails when a sheet was removed after dispatch", () => {
    expect(deriveRunOutcome(2, sheets("completed"))).toBe("failed");
    expect(deriveRunOutcome(1, [])).toBe("failed");
  });
});
