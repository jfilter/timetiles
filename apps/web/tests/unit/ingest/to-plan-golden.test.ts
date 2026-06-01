/**
 * Golden safety-net for the unified interpretation refactor (ADR 0040, Phase 0).
 *
 * These tests lock the CURRENT behavior of the import→event interpretation paths
 * so later phases (which route the pipeline through one `interpretRow` normalizer)
 * can be proven byte-identical. They must stay green through Phase 1; only Phase 2
 * intentionally changes the date path, at which point the affected goldens are
 * updated with documented before/after.
 *
 * The load-bearing invariant: the ops `toPlan` derives, applied in order, must
 * reproduce `applyTransforms` exactly — because the content-hash dedup ID
 * (`generateUniqueId`) is computed over the transformed row. Any drift here
 * silently changes dedup identity for every content-hash dataset.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { toPlan } from "@/lib/ingest/to-plan";
import { applyTransforms } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
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
  { name: "no transforms (identity)", transforms: [], row: { a: "1", b: "2" } },
];

const datasetWith = (transforms: IngestTransform[], idStrategy: Dataset["idStrategy"]): Dataset =>
  ({ id: 1, ingestTransforms: transforms, idStrategy }) as unknown as Dataset;

describe("toPlan golden — Phase 0 behavior lock", () => {
  describe("op fidelity: plan.ops reproduce applyTransforms byte-for-byte (order preserved)", () => {
    it.each(CORPUS)("$name", ({ transforms, row }) => {
      const expected = applyTransforms(row, transforms);
      // plan.ops is the verbatim, order-preserving transform list — applying it
      // MUST equal the legacy path. (Column-grouping the ops would reorder e.g.
      // a string-op authored before a rename of the same column.)
      const plan = toPlan(datasetWith(transforms, { type: "auto-generate" }));
      const viaPlan = applyTransforms(row, plan.ops);
      expect(JSON.stringify(viaPlan)).toBe(JSON.stringify(expected));
    });
  });

  describe("content-hash dedup IDs are stable across the plan", () => {
    it.each(CORPUS)("$name", ({ transforms, row }) => {
      const dataset = datasetWith(transforms, { type: "content-hash", duplicateStrategy: "skip", excludeFields: [] });
      const expectedId = generateUniqueId(applyTransforms(row, transforms), dataset);
      const planId = generateUniqueId(applyTransforms(row, toPlan(dataset).ops), dataset);
      expect(planId).toBe(expectedId);
    });
  });

  describe("roles + coordinate policy derive from fieldMappingOverrides", () => {
    it("maps override paths to roles and coordinateFormat to the coordinate policy", () => {
      const dataset = {
        id: 1,
        ingestTransforms: [],
        idStrategy: { type: "auto-generate" },
        fieldMappingOverrides: {
          titlePath: "name",
          timestampPath: "when",
          coordinatePath: "loc",
          coordinateFormat: "lng,lat",
          latitudePath: "y",
          longitudePath: "x",
        },
      } as unknown as Dataset;

      const plan = toPlan(dataset);

      expect(plan.roles.title).toBe("name");
      expect(plan.roles.timestamp).toBe("when");
      expect(plan.roles.coordinate).toBe("loc");
      const coordCol = plan.columns.find((c) => c.field === "loc");
      expect(coordCol?.kind).toBe("coordinate-pair");
      expect(coordCol?.policy).toMatchObject({ kind: "coordinate-pair", order: "lng,lat" });
    });

    it("leaves coordinate order undefined when coordinateFormat is ambiguous", () => {
      const dataset = {
        id: 1,
        ingestTransforms: [],
        idStrategy: { type: "auto-generate" },
        fieldMappingOverrides: { coordinatePath: "loc", coordinateFormat: "ambiguous" },
      } as unknown as Dataset;

      const plan = toPlan(dataset);
      const coordCol = plan.columns.find((c) => c.field === "loc");
      expect(coordCol).toBeDefined();
      const policy = coordCol?.policy as { kind: string; order?: string } | undefined;
      expect(policy?.kind).toBe("coordinate-pair");
      expect(policy?.order).toBeUndefined();
    });
  });

  describe("date-parse transform surfaces a date column policy AND stays in the op replay", () => {
    it("extracts inputFormat into a date column policy while retaining the op for byte-identity", () => {
      const transforms = [tx({ type: "date-parse", from: "d", inputFormat: "DD/MM/YYYY", outputFormat: "YYYY-MM-DD" })];
      const plan = toPlan(datasetWith(transforms, { type: "auto-generate" }));

      // Declarative typing: column "d" resolves to a date with DMY order.
      const dateCol = plan.columns.find((c) => c.field === "d");
      expect(dateCol?.kind).toBe("date");
      expect(dateCol?.policy).toMatchObject({ kind: "date", order: "DMY" });

      // Ordered replay: the date-parse op is retained verbatim (it rewrites the
      // cell to ISO before detection — removing it would change behavior).
      expect(plan.ops).toHaveLength(1);
      expect(plan.ops[0]).toMatchObject({ type: "date-parse", from: "d", inputFormat: "DD/MM/YYYY" });
    });
  });
});
