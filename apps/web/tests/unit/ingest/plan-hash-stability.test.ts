/**
 * Dedup-hash stability guard for the canonical interpretation plan (ADR 0040).
 *
 * Re-anchored from the former `to-plan-golden.test.ts`: `toPlan` was deleted when
 * the plan became the canonical persisted storage. The load-bearing invariant is
 * unchanged — the ops the plan-builder authors, applied in order, must reproduce
 * the legacy `buildTransformsFromDataset` transform list byte-for-byte, because
 * the content-hash dedup ID (`generateUniqueId`) is computed over the transformed
 * row. Any drift silently changes dedup identity for every content-hash dataset.
 *
 * The legacy anchor (`buildTransformsFromDataset`) is retained as the EXPECTED
 * value so the new authoring path is tested against the historical semantics,
 * not against itself.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { interpretRow } from "@/lib/ingest/interpret";
import { buildPlanFromWizard } from "@/lib/ingest/plan-builder";
import { buildTransformsFromDataset } from "@/lib/ingest/transform-builders";
import { applyTransforms } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping } from "@/lib/ingest/types/wizard";
import { generateUniqueId } from "@/lib/services/id-generation";
import type { Dataset } from "@/payload-types";

const tx = (t: Partial<IngestTransform> & { type: IngestTransform["type"] }): IngestTransform =>
  ({
    id: `t-${t.type}-${(t as { from?: string }).from ?? "x"}`,
    active: true,
    autoDetected: false,
    ...t,
  }) as IngestTransform;

/** Representative transform corpus covering every op type that survives into `ops`. */
const CORPUS: Array<{ name: string; transforms: IngestTransform[]; row: Record<string, unknown> }> = [
  {
    name: "rename + string-op + extract",
    transforms: [
      tx({ type: "rename", from: "Titel", to: "title" }),
      tx({ type: "string-op", from: "title", operation: "trim" }),
      tx({ type: "extract", from: "url", to: "slug", pattern: "/([^/]+)$", group: 1 }),
    ],
    row: { Titel: "  Konzert  ", url: "https://x.test/abc-123", city: "Berlin" },
  },
  {
    name: "concatenate + split-to-array",
    transforms: [
      tx({ type: "concatenate", fromFields: ["first", "last"], separator: " ", to: "name" }),
      tx({ type: "split-to-array", from: "tags", delimiter: "," }),
    ],
    row: { first: "Ada", last: "Lovelace", tags: "math, code" },
  },
  {
    name: "split + parse-json-array",
    transforms: [
      tx({ type: "split", from: "coords", delimiter: ",", toFields: ["lat", "lng"] }),
      tx({ type: "parse-json-array", from: "categories" }),
    ],
    row: { coords: "52.5,13.4", categories: '["a","b"]' },
  },
  {
    name: "op BEFORE rename of same column (ordering-sensitive)",
    transforms: [
      tx({ type: "string-op", from: "name", operation: "uppercase" }),
      tx({ type: "rename", from: "name", to: "title" }),
    ],
    row: { name: "ada" },
  },
  {
    name: "date-parse (retained in op replay)",
    transforms: [tx({ type: "date-parse", from: "d", inputFormat: "DD/MM/YYYY", outputFormat: "YYYY-MM-DD" })],
    row: { d: "02/03/2024" },
  },
  { name: "no transforms (identity)", transforms: [], row: { a: "1", b: "2" } },
];

const datasetWith = (idStrategy: Dataset["idStrategy"]): Dataset => ({ id: 1, idStrategy }) as unknown as Dataset;

describe("plan hash stability — plan.ops reproduce the legacy buildTransformsFromDataset path", () => {
  describe("op fidelity: applyTransforms(plan.ops) === applyTransforms(legacy transforms) (order preserved)", () => {
    it.each(CORPUS)("$name", ({ transforms, row }) => {
      // Legacy anchor: the transform list the historical dataset.ingestTransforms
      // round-trip would have produced (active/complete filter + per-type normalize).
      const legacyTransforms = buildTransformsFromDataset({ ingestTransforms: transforms });
      const expected = applyTransforms(row, legacyTransforms);

      // New authoring path: the wizard plan-builder funnels the same typed array.
      const plan = buildPlanFromWizard(undefined, transforms, "strict");
      const viaPlan = applyTransforms(row, plan.ops);

      expect(JSON.stringify(viaPlan)).toBe(JSON.stringify(expected));
      // interpretRow (the live normalizer) must agree with the legacy path too.
      expect(JSON.stringify(interpretRow(row, plan))).toBe(JSON.stringify(expected));
    });
  });

  describe("content-hash dedup IDs are stable across the plan", () => {
    it.each(CORPUS)("$name", ({ transforms, row }) => {
      const dataset = datasetWith({ type: "content-hash", duplicateStrategy: "skip", excludeFields: [] });
      const legacyTransforms = buildTransformsFromDataset({ ingestTransforms: transforms });
      const expectedId = generateUniqueId(applyTransforms(row, legacyTransforms), dataset);

      const plan = buildPlanFromWizard(undefined, transforms, "strict");
      const planId = generateUniqueId(applyTransforms(row, plan.ops), dataset);

      expect(planId).toBe(expectedId);
    });
  });

  describe("roles + coordinate policy derive from the FieldMapping the wizard authors", () => {
    const fm = (partial: Partial<FieldMapping>): FieldMapping => ({
      sheetIndex: 0,
      titleField: null,
      descriptionField: null,
      locationNameField: null,
      dateField: null,
      endDateField: null,
      idField: null,
      idStrategy: "content-hash",
      locationField: null,
      latitudeField: null,
      longitudeField: null,
      coordinateField: null,
      ...partial,
    });

    it("maps FieldMapping fields to roles and coordinate column policy", () => {
      const plan = buildPlanFromWizard(
        fm({ titleField: "name", dateField: "when", coordinateField: "loc", latitudeField: "y", longitudeField: "x" }),
        [],
        "strict"
      );

      expect(plan.roles.title).toBe("name");
      expect(plan.roles.timestamp).toBe("when");
      expect(plan.roles.coordinate).toBe("loc");
      expect(plan.roles.latitude).toBe("y");
      expect(plan.roles.longitude).toBe("x");

      const coordCol = plan.columns.find((c) => c.field === "loc");
      expect(coordCol?.kind).toBe("coordinate-pair");
      // The wizard authors the coordinate field but not its order — the detector /
      // approve flow resolves the axis order. Until then the policy order is undecided.
      const policy = coordCol?.policy as { kind: string; order?: string } | undefined;
      expect(policy?.kind).toBe("coordinate-pair");
      expect(policy?.order).toBeUndefined();
      expect(plan.ambiguityResolution).toBe("strict");
    });
  });

  describe("date-parse transform surfaces a date column policy AND stays in the op replay", () => {
    it("extracts inputFormat into a date column policy while retaining the op for byte-identity", () => {
      const transforms = [tx({ type: "date-parse", from: "d", inputFormat: "DD/MM/YYYY", outputFormat: "YYYY-MM-DD" })];
      const plan = buildPlanFromWizard(undefined, transforms, "strict");

      const dateCol = plan.columns.find((c) => c.field === "d");
      expect(dateCol?.kind).toBe("date");
      expect(dateCol?.policy).toMatchObject({ kind: "date", order: "DMY" });

      expect(plan.ops).toHaveLength(1);
      expect(plan.ops[0]).toMatchObject({ type: "date-parse", from: "d", inputFormat: "DD/MM/YYYY" });
    });
  });
});
