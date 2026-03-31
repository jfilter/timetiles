/**
 * Unit tests for transform builders.
 *
 * Tests that dataset ingest transforms are correctly converted
 * to typed IngestTransform objects for the import pipeline.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { buildTransformsFromDataset } from "@/lib/jobs/utils/transform-builders";
import type { Dataset } from "@/payload-types";

const makeDataset = (transforms: Record<string, unknown>[]): Dataset =>
  ({ ingestTransforms: transforms.map((t, i) => ({ id: `t${i}`, active: true, ...t })) }) as unknown as Dataset;

describe("buildTransformsFromDataset", () => {
  it("should build string-op expression with to field", () => {
    const dataset = makeDataset([
      {
        type: "string-op",
        from: "type_of_violence",
        to: "Violence Type",
        operation: "expression",
        expression: '(value == 1 ? "State-based" : value)',
      },
    ]);

    const transforms = buildTransformsFromDataset(dataset);
    expect(transforms).toHaveLength(1);
    expect(transforms[0]).toMatchObject({
      type: "string-op",
      from: "type_of_violence",
      to: "Violence Type",
      operation: "expression",
    });
  });

  it("should build string-op without to field (defaults to undefined)", () => {
    const dataset = makeDataset([{ type: "string-op", from: "name", operation: "uppercase" }]);

    const transforms = buildTransformsFromDataset(dataset);
    expect(transforms).toHaveLength(1);
    expect(transforms[0]).toMatchObject({ type: "string-op", from: "name", operation: "uppercase" });
    expect((transforms[0] as { to?: string }).to).toBeUndefined();
  });

  it("should build rename transform", () => {
    const dataset = makeDataset([{ type: "rename", from: "old_name", to: "New Name" }]);

    const transforms = buildTransformsFromDataset(dataset);
    expect(transforms).toHaveLength(1);
    expect(transforms[0]).toMatchObject({ type: "rename", from: "old_name", to: "New Name" });
  });

  it("should build concatenate transform", () => {
    const dataset = makeDataset([{ type: "concatenate", fromFields: ["a", "b"], separator: " — ", to: "combined" }]);

    const transforms = buildTransformsFromDataset(dataset);
    expect(transforms).toHaveLength(1);
    expect(transforms[0]).toMatchObject({
      type: "concatenate",
      fromFields: ["a", "b"],
      separator: " — ",
      to: "combined",
    });
  });

  it("should skip inactive transforms", () => {
    const dataset = {
      ingestTransforms: [
        { id: "t1", type: "rename", from: "a", to: "b", active: false },
        { id: "t2", type: "rename", from: "c", to: "d", active: true },
      ],
    } as unknown as Dataset;

    const transforms = buildTransformsFromDataset(dataset);
    expect(transforms).toHaveLength(1);
    expect(transforms[0]).toMatchObject({ from: "c", to: "d" });
  });

  it("should build multiple transforms in order", () => {
    const dataset = makeDataset([
      { type: "string-op", from: "type", to: "Type Label", operation: "expression", expression: "value" },
      { type: "rename", from: "name", to: "Title" },
      { type: "concatenate", fromFields: ["Type Label", "Title"], separator: " | ", to: "summary" },
    ]);

    const transforms = buildTransformsFromDataset(dataset);
    expect(transforms).toHaveLength(3);
    expect(transforms[0]).toMatchObject({ type: "string-op", to: "Type Label" });
    expect(transforms[1]).toMatchObject({ type: "rename", to: "Title" });
    expect(transforms[2]).toMatchObject({ type: "concatenate", to: "summary" });
  });
});
