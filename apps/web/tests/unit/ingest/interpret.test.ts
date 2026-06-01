/**
 * Phase-1 equivalence proof for `interpretRow` (ADR 0040).
 *
 * Asserts the new normalizer reproduces the legacy call sites exactly:
 * - `interpretRow(row, toPlan(ds))` === `applyTransforms(row, buildTransformsFromDataset(ds))`
 * - `interpretRow(row, plan, { only })` === `applyTransforms(row, buildTransformsForTargetPath(ds, only))`
 *
 * These guard the four pipeline swaps in Phase 1 against any behavioral drift.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { interpretRow, interpretRows } from "@/lib/ingest/interpret";
import { toPlan } from "@/lib/ingest/to-plan";
import { buildTransformsForTargetPath, buildTransformsFromDataset } from "@/lib/ingest/transform-builders";
import { applyTransforms } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { Dataset } from "@/payload-types";

const tx = (t: Partial<IngestTransform> & { type: IngestTransform["type"] }): IngestTransform =>
  ({
    id: `t-${t.type}-${(t as { from?: string }).from ?? "x"}`,
    active: true,
    autoDetected: false,
    ...t,
  }) as IngestTransform;

const datasetWith = (transforms: IngestTransform[], idStrategy?: Dataset["idStrategy"]): Dataset =>
  ({ id: 1, ingestTransforms: transforms, idStrategy: idStrategy ?? { type: "auto-generate" } }) as unknown as Dataset;

const FULL_CHAIN: IngestTransform[] = [
  tx({ type: "concatenate", fromFields: ["first", "last"], separator: " ", to: "name" }),
  tx({ type: "string-op", from: "name", operation: "uppercase" }),
  tx({ type: "rename", from: "raw_date", to: "date" }),
  tx({ type: "extract", from: "url", to: "id", pattern: "/([^/]+)$", group: 1 }),
];

const ROW = { first: "ada", last: "lovelace", raw_date: "01/02/2024", url: "https://x.test/ev-9" };

describe("interpretRow — Phase 1 legacy equivalence", () => {
  it("structural step equals applyTransforms over the full chain", () => {
    const ds = datasetWith(FULL_CHAIN);
    const expected = applyTransforms(ROW, buildTransformsFromDataset(ds));
    const actual = interpretRow(ROW, toPlan(ds));
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  });

  it("preserves op order (op authored before rename of same column)", () => {
    const ds = datasetWith([
      tx({ type: "string-op", from: "name", operation: "uppercase" }),
      tx({ type: "rename", from: "name", to: "title" }),
    ]);
    const expected = applyTransforms({ name: "ada" }, buildTransformsFromDataset(ds));
    const actual = interpretRow({ name: "ada" }, toPlan(ds));
    expect(actual).toEqual(expected);
    expect(actual).toEqual({ title: "ADA" });
  });

  it("{ only } projection equals buildTransformsForTargetPath", () => {
    const ds = datasetWith(FULL_CHAIN);
    const expected = applyTransforms(ROW, buildTransformsForTargetPath(ds, "name"));
    const actual = interpretRow(ROW, toPlan(ds), { only: "name" });
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  });

  it("{ only } for a path produced by a single op narrows correctly", () => {
    const ds = datasetWith(FULL_CHAIN);
    // "id" comes only from the extract op; concatenate/string-op/rename are irrelevant.
    const expected = applyTransforms(ROW, buildTransformsForTargetPath(ds, "id"));
    const actual = interpretRow(ROW, toPlan(ds), { only: "id" });
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  });

  it("returns the row unchanged when there are no ops", () => {
    const plan = toPlan(datasetWith([]));
    const row = { a: "1" };
    expect(interpretRow(row, plan)).toBe(row);
  });

  it("interpretRows equals mapping interpretRow over a batch", () => {
    const ds = datasetWith(FULL_CHAIN);
    const plan = toPlan(ds);
    const rows = [ROW, { first: "grace", last: "hopper", raw_date: "03/04/2024", url: "https://x.test/ev-1" }];
    const viaBatch = interpretRows(rows, plan);
    const viaMap = rows.map((r) => interpretRow(r, plan));
    expect(JSON.stringify(viaBatch)).toBe(JSON.stringify(viaMap));
  });
});
