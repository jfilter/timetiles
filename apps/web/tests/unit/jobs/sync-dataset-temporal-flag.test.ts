/**
 * Unit tests for syncDatasetTemporalFlag.
 *
 * Regression: the flag must be sticky-true. A single sheet/import without a
 * timestamp must never clear hasTemporalData, because sheets run in parallel
 * and prior imports may already have contributed temporal data. The old code
 * set hasTemporalData = hasTimestamp unconditionally, which let a non-temporal
 * sheet flip a temporal dataset back to false.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it, vi } from "vitest";

import { syncDatasetTemporalFlag } from "@/lib/jobs/handlers/schema-detection-job-support";

const makePayload = () => ({ update: vi.fn().mockResolvedValue({}) });
const makeDataset = (hasTemporalData: boolean) => ({ id: 1, hasTemporalData }) as never;

describe("syncDatasetTemporalFlag", () => {
  it("turns the flag ON when a timestamp is detected and it was off", async () => {
    const payload = makePayload();
    await syncDatasetTemporalFlag(payload as never, makeDataset(false), { timestampPath: "date" });
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hasTemporalData: true } }));
  });

  it("never clears the flag when this sheet has no timestamp (sticky true)", async () => {
    const payload = makePayload();
    await syncDatasetTemporalFlag(payload as never, makeDataset(true), {});
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("does nothing when already temporal and a timestamp is present", async () => {
    const payload = makePayload();
    await syncDatasetTemporalFlag(payload as never, makeDataset(true), { timestampPath: "date" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("does nothing when not temporal and no timestamp is present", async () => {
    const payload = makePayload();
    await syncDatasetTemporalFlag(payload as never, makeDataset(false), {});
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("ignores a null dataset", async () => {
    const payload = makePayload();
    await syncDatasetTemporalFlag(payload as never, null, { timestampPath: "date" });
    expect(payload.update).not.toHaveBeenCalled();
  });
});
