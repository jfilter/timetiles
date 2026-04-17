/**
 * Unit tests for {@link readDuplicateStrategy}.
 *
 * The helper replaces three chained `as Record<string, unknown>` casts that
 * used to sit in every handler that branches on the configured duplicate
 * strategy. The tests pin the behaviour: if the snapshot shape drifts, we
 * still default to the safe `"skip"` branch rather than silently losing
 * data by defaulting to `"update"`.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { readDuplicateStrategy } from "@/lib/jobs/utils/resource-loading";
import type { IngestJob } from "@/payload-types";

const jobWith = (configSnapshot: unknown): Pick<IngestJob, "configSnapshot"> =>
  ({ configSnapshot }) as unknown as Pick<IngestJob, "configSnapshot">;

describe("readDuplicateStrategy", () => {
  it("defaults to 'skip' when configSnapshot is missing", () => {
    expect(readDuplicateStrategy(jobWith(undefined))).toBe("skip");
    expect(readDuplicateStrategy(jobWith(null))).toBe("skip");
  });

  it("defaults to 'skip' when idStrategy is absent", () => {
    expect(readDuplicateStrategy(jobWith({}))).toBe("skip");
    expect(readDuplicateStrategy(jobWith({ idStrategy: null }))).toBe("skip");
  });

  it("defaults to 'skip' when duplicateStrategy is unset or unexpected", () => {
    expect(readDuplicateStrategy(jobWith({ idStrategy: { type: "external" } }))).toBe("skip");
    expect(readDuplicateStrategy(jobWith({ idStrategy: { duplicateStrategy: null } }))).toBe("skip");
    expect(readDuplicateStrategy(jobWith({ idStrategy: { duplicateStrategy: "overwrite" } }))).toBe("skip");
    expect(readDuplicateStrategy(jobWith({ idStrategy: { duplicateStrategy: 42 } }))).toBe("skip");
  });

  it("returns 'update' only when duplicateStrategy is exactly 'update'", () => {
    expect(readDuplicateStrategy(jobWith({ idStrategy: { duplicateStrategy: "update" } }))).toBe("update");
  });

  it("returns 'skip' when duplicateStrategy is 'skip'", () => {
    expect(readDuplicateStrategy(jobWith({ idStrategy: { duplicateStrategy: "skip" } }))).toBe("skip");
  });

  it("returns 'skip' for malformed snapshots", () => {
    expect(readDuplicateStrategy(jobWith("not an object"))).toBe("skip");
    expect(readDuplicateStrategy(jobWith(42))).toBe("skip");
    expect(readDuplicateStrategy(jobWith([]))).toBe("skip");
  });
});
