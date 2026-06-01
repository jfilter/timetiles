/**
 * Equivalence proof for `interpretRow` (ADR 0040).
 *
 * Asserts the normalizer reproduces the legacy transform path exactly:
 * - `interpretRow(row, buildPlanFromWizard(_, transforms))` ===
 *   `applyTransforms(row, buildTransformsFromDataset({ ingestTransforms }))`
 * - `interpretRow(row, plan, { only })` ===
 *   `applyTransforms(row, buildTransformsForTargetPath({ ingestTransforms }, only))`
 *
 * These guard the pipeline swaps against any behavioral drift.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { interpretRow, interpretRows } from "@/lib/ingest/interpret";
import { buildPlanFromWizard } from "@/lib/ingest/plan-builder";
import {
  buildTransformsForTargetPath,
  buildTransformsFromDataset,
  type TransformSource,
} from "@/lib/ingest/transform-builders";
import { applyTransforms } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";

const tx = (t: Partial<IngestTransform> & { type: IngestTransform["type"] }): IngestTransform =>
  ({
    id: `t-${t.type}-${(t as { from?: string }).from ?? "x"}`,
    active: true,
    autoDetected: false,
    ...t,
  }) as IngestTransform;

const source = (transforms: IngestTransform[]): TransformSource => ({ ingestTransforms: transforms });
const planOf = (transforms: IngestTransform[]) => buildPlanFromWizard(undefined, transforms, "best-effort");

const FULL_CHAIN: IngestTransform[] = [
  tx({ type: "concatenate", fromFields: ["first", "last"], separator: " ", to: "name" }),
  tx({ type: "string-op", from: "name", operation: "uppercase" }),
  tx({ type: "rename", from: "raw_date", to: "date" }),
  tx({ type: "extract", from: "url", to: "id", pattern: "/([^/]+)$", group: 1 }),
];

const ROW = { first: "ada", last: "lovelace", raw_date: "01/02/2024", url: "https://x.test/ev-9" };

describe("interpretRow — legacy transform equivalence", () => {
  it("structural step equals applyTransforms over the full chain", () => {
    const expected = applyTransforms(ROW, buildTransformsFromDataset(source(FULL_CHAIN)));
    const actual = interpretRow(ROW, planOf(FULL_CHAIN));
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  });

  it("preserves op order (op authored before rename of same column)", () => {
    const transforms = [
      tx({ type: "string-op", from: "name", operation: "uppercase" }),
      tx({ type: "rename", from: "name", to: "title" }),
    ];
    const expected = applyTransforms({ name: "ada" }, buildTransformsFromDataset(source(transforms)));
    const actual = interpretRow({ name: "ada" }, planOf(transforms));
    expect(actual).toEqual(expected);
    expect(actual).toEqual({ title: "ADA" });
  });

  it("{ only } projection equals buildTransformsForTargetPath", () => {
    const expected = applyTransforms(ROW, buildTransformsForTargetPath(source(FULL_CHAIN), "name"));
    const actual = interpretRow(ROW, planOf(FULL_CHAIN), { only: "name" });
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  });

  it("{ only } for a path produced by a single op narrows correctly", () => {
    // "id" comes only from the extract op; concatenate/string-op/rename are irrelevant.
    const expected = applyTransforms(ROW, buildTransformsForTargetPath(source(FULL_CHAIN), "id"));
    const actual = interpretRow(ROW, planOf(FULL_CHAIN), { only: "id" });
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  });

  it("returns the row unchanged when there are no ops", () => {
    const plan = planOf([]);
    const row = { a: "1" };
    expect(interpretRow(row, plan)).toBe(row);
  });

  it("interpretRows equals mapping interpretRow over a batch", () => {
    const plan = planOf(FULL_CHAIN);
    const rows = [ROW, { first: "grace", last: "hopper", raw_date: "03/04/2024", url: "https://x.test/ev-1" }];
    const viaBatch = interpretRows(rows, plan);
    const viaMap = rows.map((r) => interpretRow(r, plan));
    expect(JSON.stringify(viaBatch)).toBe(JSON.stringify(viaMap));
  });
});
