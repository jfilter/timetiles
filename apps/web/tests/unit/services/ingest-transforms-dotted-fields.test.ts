/**
 * Regression tests for dotted field handling in the ingest transforms.
 *
 * The path helpers themselves are covered in `tests/unit/utils/object-path.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { applyPreviewTransforms, applyTransforms, applyTransformsBatch } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";

describe("dotted field transform regressions", () => {
  it("should rename flattened dotted keys without treating them as nested paths", () => {
    const data = { "user.name": "Flattened User", user: { name: "Nested User" } };
    const transforms: IngestTransform[] = [
      { id: "1", type: "rename", from: "user.name", to: "title", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);

    expect(result).toEqual({ user: { name: "Nested User" }, title: "Flattened User" });
  });

  it("should keep literal dotted keys when writing back to the same field", () => {
    const data = { "user.name": "john" };
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "user.name", operation: "uppercase", active: true, autoDetected: false },
    ];

    const result = applyTransforms(data, transforms);

    expect(result).toEqual({ "user.name": "JOHN" });
  });

  it("should transform flattened dotted headers across batches", () => {
    const rows = [{ "user.name": "alpha" }, { "user.name": "beta" }];
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "user.name", operation: "uppercase", active: true, autoDetected: false },
    ];

    expect(applyTransformsBatch(rows, transforms)).toEqual([{ "user.name": "ALPHA" }, { "user.name": "BETA" }]);
  });

  it("should transform flattened dotted headers in preview mode", () => {
    const rows = [{ "user.name": "preview user" }];
    const transforms: IngestTransform[] = [
      { id: "1", type: "string-op", from: "user.name", operation: "uppercase", active: true, autoDetected: false },
    ];

    expect(applyPreviewTransforms(rows, transforms)).toEqual([{ "user.name": "PREVIEW USER" }]);
  });
});
