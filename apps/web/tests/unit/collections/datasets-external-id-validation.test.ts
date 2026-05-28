/**
 * Unit tests for external-ID transform validation on the Datasets collection.
 *
 * Guards the invariant that duplicate analysis (which derives the uniqueId from
 * only the transforms producing externalIdPath) and event creation (which runs
 * the full transform set) compute the same external ID. A transform that moves
 * the external-ID field elsewhere deletes it and breaks that equivalence.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { findExternalIdMoveAway, validateExternalIdTransforms } from "@/lib/collections/datasets/hooks";

const external = (externalIdPath: string) => ({ type: "external", externalIdPath });

describe("findExternalIdMoveAway", () => {
  it("returns null when the strategy is not external", () => {
    const transforms = [{ type: "rename", from: "ref", to: "other", active: true }];
    expect(findExternalIdMoveAway({ type: "content-hash" }, transforms)).toBeNull();
  });

  it("returns null when externalIdPath is missing", () => {
    const transforms = [{ type: "rename", from: "ref", to: "other", active: true }];
    expect(findExternalIdMoveAway({ type: "external" }, transforms)).toBeNull();
  });

  it("flags a rename that moves the external-ID field to a different path", () => {
    const transforms = [{ type: "rename", from: "ref", to: "archived", active: true }];
    expect(findExternalIdMoveAway(external("ref"), transforms)).toEqual({ index: 0, from: "ref", to: "archived" });
  });

  it("flags a string-op that moves the external-ID field to a different path", () => {
    const transforms = [{ type: "string-op", from: "ref", to: "ref_upper", operation: "uppercase", active: true }];
    expect(findExternalIdMoveAway(external("ref"), transforms)).toEqual({ index: 0, from: "ref", to: "ref_upper" });
  });

  it("allows a rename that PRODUCES the external-ID field", () => {
    const transforms = [{ type: "rename", from: "raw_id", to: "ref", active: true }];
    expect(findExternalIdMoveAway(external("ref"), transforms)).toBeNull();
  });

  it("allows an in-place string-op on the external-ID field (no target move)", () => {
    const transforms = [{ type: "string-op", from: "ref", operation: "uppercase", active: true }];
    expect(findExternalIdMoveAway(external("ref"), transforms)).toBeNull();
  });

  it("allows a rename whose target equals the source (no-op)", () => {
    const transforms = [{ type: "rename", from: "ref", to: "ref", active: true }];
    expect(findExternalIdMoveAway(external("ref"), transforms)).toBeNull();
  });

  it("ignores inactive transforms (they never run)", () => {
    const transforms = [{ type: "rename", from: "ref", to: "archived", active: false }];
    expect(findExternalIdMoveAway(external("ref"), transforms)).toBeNull();
  });

  it("ignores transform types that do not delete their source", () => {
    // split/concatenate/extract read `from` but leave it in place.
    const transforms = [
      { type: "split", from: "ref", delimiter: ",", toFields: ["a", "b"], active: true },
      { type: "extract", from: "ref", to: "captured", pattern: "(\\d+)", active: true },
    ];
    expect(findExternalIdMoveAway(external("ref"), transforms)).toBeNull();
  });
});

describe("validateExternalIdTransforms", () => {
  const run = (data: Record<string, unknown>, operation: "create" | "update" | "read" = "create") =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateExternalIdTransforms({ data, operation } as any);

  it("throws when a transform moves the external-ID field away", () => {
    expect(() =>
      run({
        idStrategy: external("ref"),
        ingestTransforms: [{ type: "rename", from: "ref", to: "archived", active: true }],
      })
    ).toThrow(/moves the external ID field "ref" to "archived"/);
  });

  it("passes a valid external-ID config through unchanged", () => {
    const data = {
      idStrategy: external("ref"),
      ingestTransforms: [{ type: "rename", from: "raw_id", to: "ref", active: true }],
    };
    expect(run(data)).toBe(data);
  });

  it("is a no-op for non create/update operations", () => {
    const data = {
      idStrategy: external("ref"),
      ingestTransforms: [{ type: "rename", from: "ref", to: "archived", active: true }],
    };
    expect(run(data, "read")).toBe(data);
  });
});
