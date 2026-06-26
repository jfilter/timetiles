/**
 * Unit tests for the scrapers beforeChange hook that resets nextRunAt.
 *
 * A changed cron schedule must clear the stale nextRunAt (which shouldScraperRunNow
 * trusts with absolute precedence) so the new cadence takes effect immediately —
 * mirroring the scheduled-ingests collection hook and the manifest-sync path.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { resetNextRunOnScheduleChange } from "@/lib/collections/scrapers/hooks";

type HookArgs = Parameters<typeof resetNextRunOnScheduleChange>[0];

const runHook = (
  data: Record<string, unknown> | undefined,
  originalDoc: Record<string, unknown> | undefined,
  operation: "create" | "update" = "update"
): Record<string, unknown> | undefined =>
  resetNextRunOnScheduleChange({ data, originalDoc, operation } as unknown as HookArgs) as
    | Record<string, unknown>
    | undefined;

describe("scrapers resetNextRunOnScheduleChange hook", () => {
  const STALE = "2099-01-01T00:00:00.000Z";

  it("clears nextRunAt when the cron schedule changes on update", () => {
    const result = runHook(
      { schedule: "0 * * * *", nextRunAt: STALE }, // changed to hourly
      { schedule: "0 6 * * *", nextRunAt: STALE } // was daily
    );
    expect(result?.nextRunAt).toBeNull();
  });

  it("clears nextRunAt when the schedule is cleared to manual-only", () => {
    const result = runHook({ schedule: "", nextRunAt: STALE }, { schedule: "0 6 * * *", nextRunAt: STALE });
    expect(result?.nextRunAt).toBeNull();
  });

  it("preserves nextRunAt when the schedule is unchanged", () => {
    const result = runHook(
      { schedule: "0 6 * * *", name: "Renamed", nextRunAt: STALE },
      { schedule: "0 6 * * *", nextRunAt: STALE }
    );
    expect(result?.nextRunAt).toBe(STALE);
  });

  it("preserves nextRunAt when the update omits schedule (partial update)", () => {
    const result = runHook({ name: "Renamed", nextRunAt: STALE }, { schedule: "0 6 * * *", nextRunAt: STALE });
    expect(result?.nextRunAt).toBe(STALE);
  });

  it("does not set nextRunAt on create", () => {
    const result = runHook({ schedule: "0 6 * * *" }, undefined, "create");
    expect(result?.nextRunAt).toBeUndefined();
  });
});
