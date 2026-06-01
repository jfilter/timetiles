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

import {
  collectProtectedMappingPaths,
  findExternalIdMoveAway,
  findTransformMovingAwayPath,
  validateExternalIdPresent,
  validateExternalIdTransforms,
  validateMappingOverrideTransforms,
} from "@/lib/collections/datasets/hooks";

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

  /** Wrap an ops array in the interpretation-plan shape the hooks now read. */
  const planWith = (ops: unknown[], roles: Record<string, unknown> = {}) => ({ ops, roles, columns: [] });

  it("throws when a transform moves the external-ID field away", () => {
    expect(() =>
      run({
        idStrategy: external("ref"),
        interpretationPlan: planWith([{ type: "rename", from: "ref", to: "archived", active: true }]),
      })
    ).toThrow(/moves the external ID field "ref" to "archived"/);
  });

  it("passes a valid external-ID config through unchanged", () => {
    const data = {
      idStrategy: external("ref"),
      interpretationPlan: planWith([{ type: "rename", from: "raw_id", to: "ref", active: true }]),
    };
    expect(run(data)).toBe(data);
  });

  it("is a no-op for non create/update operations", () => {
    const data = {
      idStrategy: external("ref"),
      interpretationPlan: planWith([{ type: "rename", from: "ref", to: "archived", active: true }]),
    };
    expect(run(data, "read")).toBe(data);
  });

  it("detects a move-away on a partial update where idStrategy lives in originalDoc", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateExternalIdTransforms({
        data: { interpretationPlan: planWith([{ type: "rename", from: "ref", to: "archived", active: true }]) },
        operation: "update",
        originalDoc: { idStrategy: external("ref") },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    ).toThrow(/moves the external ID field "ref" to "archived"/);
  });

  it("detects a move-away on a partial update where the plan lives in originalDoc", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateExternalIdTransforms({
        data: { idStrategy: external("location") },
        operation: "update",
        originalDoc: {
          interpretationPlan: planWith([{ type: "rename", from: "location", to: "archived", active: true }]),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    ).toThrow(/moves the external ID field "location" to "archived"/);
  });
});

describe("findTransformMovingAwayPath", () => {
  it("flags a rename that moves the path away", () => {
    const transforms = [{ type: "rename", from: "ref", to: "archived", active: true }];
    expect(findTransformMovingAwayPath(transforms, "ref")).toEqual({ index: 0, from: "ref", to: "archived" });
  });

  it("flags a string-op that moves the path away", () => {
    const transforms = [{ type: "string-op", from: "ref", to: "ref_x", operation: "uppercase", active: true }];
    expect(findTransformMovingAwayPath(transforms, "ref")).toEqual({ index: 0, from: "ref", to: "ref_x" });
  });

  it("returns null for an in-place edit (target equals source)", () => {
    expect(findTransformMovingAwayPath([{ type: "rename", from: "ref", to: "ref", active: true }], "ref")).toBeNull();
  });

  it("returns null when target is empty", () => {
    expect(
      findTransformMovingAwayPath([{ type: "string-op", from: "ref", operation: "trim", active: true }], "ref")
    ).toBeNull();
  });

  it("returns null for a transform that produces (does not consume) the path", () => {
    expect(findTransformMovingAwayPath([{ type: "rename", from: "raw", to: "ref", active: true }], "ref")).toBeNull();
  });

  it("ignores inactive transforms", () => {
    expect(findTransformMovingAwayPath([{ type: "rename", from: "ref", to: "x", active: false }], "ref")).toBeNull();
  });

  it("ignores transform types that do not delete their source", () => {
    const transforms = [
      { type: "split", from: "ref", delimiter: ",", toFields: ["a"], active: true },
      { type: "extract", from: "ref", to: "x", pattern: "(\\d+)", active: true },
      { type: "concatenate", fromFields: ["ref", "b"], to: "x", active: true },
    ];
    expect(findTransformMovingAwayPath(transforms, "ref")).toBeNull();
  });

  it("returns the first offender when several match", () => {
    const transforms = [
      { type: "rename", from: "ref", to: "first", active: true },
      { type: "rename", from: "ref", to: "second", active: true },
    ];
    expect(findTransformMovingAwayPath(transforms, "ref")?.to).toBe("first");
  });

  it("matches dotted paths verbatim", () => {
    const transforms = [{ type: "rename", from: "meta.uuid", to: "x", active: true }];
    expect(findTransformMovingAwayPath(transforms, "meta.uuid")).toEqual({ index: 0, from: "meta.uuid", to: "x" });
  });

  it("flags a path that is produced and then moved away", () => {
    const transforms = [
      { type: "rename", from: "raw", to: "ref", active: true },
      { type: "rename", from: "ref", to: "gone", active: true },
    ];
    expect(findTransformMovingAwayPath(transforms, "ref")).toEqual({ index: 1, from: "ref", to: "gone" });
  });

  it("returns null for an empty protected path", () => {
    expect(findTransformMovingAwayPath([{ type: "rename", from: "", to: "x", active: true }], "")).toBeNull();
  });
});

describe("collectProtectedMappingPaths", () => {
  it("extracts all plan-role + geo fields with labels", () => {
    const roles = {
      latitude: "lat",
      longitude: "lng",
      location: "loc",
      locationName: "venue",
      timestamp: "date",
      endTimestamp: "end",
    };
    const paths = collectProtectedMappingPaths(roles, undefined).map((p) => p.path);
    expect(paths).toEqual(["lat", "lng", "loc", "venue", "date", "end"]);
  });

  it("skips empty/whitespace paths", () => {
    expect(collectProtectedMappingPaths({ timestamp: "  ", location: "" }, undefined)).toEqual([]);
  });

  it("de-dupes a lat/lng path shared between plan roles and geoFieldDetection", () => {
    // geoFieldDetection still uses its own *Path keys (out of scope, unchanged).
    const result = collectProtectedMappingPaths({ latitude: "lat" }, { latitudePath: "lat", longitudePath: "lng" });
    expect(result.map((p) => p.path)).toEqual(["lat", "lng"]);
  });

  it("returns [] for empty groups", () => {
    expect(collectProtectedMappingPaths(undefined, undefined)).toEqual([]);
  });
});

describe("validateExternalIdPresent", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateExternalIdPresent({ data, operation: "create", originalDoc } as any);

  it("throws when external strategy has no externalIdPath", () => {
    expect(() => run({ idStrategy: { type: "external" } })).toThrow(/requires an External ID Path/);
  });

  it("throws when externalIdPath is whitespace only", () => {
    expect(() => run({ idStrategy: { type: "external", externalIdPath: "   " } })).toThrow(
      /requires an External ID Path/
    );
  });

  it("passes when externalIdPath is present", () => {
    const data = { idStrategy: external("ref") };
    expect(run(data)).toBe(data);
  });

  it("passes for non-external strategies", () => {
    const data = { idStrategy: { type: "content-hash" } };
    expect(run(data)).toBe(data);
  });

  it("validates the merged config on a partial update (idStrategy only in originalDoc)", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateExternalIdPresent({
        data: { name: "Renamed" },
        operation: "update",
        originalDoc: { idStrategy: { type: "external" } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    ).toThrow(/requires an External ID Path/);
  });
});

describe("validateMappingOverrideTransforms", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateMappingOverrideTransforms({ data, operation: "create", originalDoc } as any);

  /** Wrap ops + roles in the interpretation-plan shape the hook now reads. */
  const planWith = (ops: unknown[], roles: Record<string, unknown> = {}) => ({ ops, roles, columns: [] });

  it("throws when a transform moves away a mapped timestamp field", () => {
    expect(() =>
      run({
        interpretationPlan: planWith([{ type: "rename", from: "event_date", to: "date", active: true }], {
          timestamp: "event_date",
        }),
      })
    ).toThrow(/the timestamp mapping points at "event_date"/);
  });

  it("passes when the mapping points at the transform target (produced field)", () => {
    const data = {
      interpretationPlan: planWith([{ type: "rename", from: "event_date", to: "date", active: true }], {
        timestamp: "date",
      }),
    };
    expect(run(data)).toBe(data);
  });

  it("is a no-op without roles", () => {
    const data = { interpretationPlan: planWith([{ type: "rename", from: "x", to: "y", active: true }]) };
    expect(run(data)).toBe(data);
  });

  it("detects a role move-away on a partial update (plan only in originalDoc)", () => {
    // Payload replaces the whole `interpretationPlan` JSON value on write; a PATCH
    // that omits it falls back to originalDoc's plan (validated via mergedConfigValue).
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateMappingOverrideTransforms({
        data: { name: "Renamed" },
        operation: "update",
        originalDoc: {
          interpretationPlan: planWith([{ type: "rename", from: "place", to: "where", active: true }], {
            location: "place",
          }),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    ).toThrow(/the location mapping points at "place"/);
  });
});
