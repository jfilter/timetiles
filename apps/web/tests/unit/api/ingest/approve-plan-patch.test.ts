/**
 * Unit tests for `patchPlanFromBody` (ingest-job approve route).
 *
 * Focus: order-pick persistence for auto-detected datasets (ADR 0040). An
 * ambiguous-order confirmation carries only the order, not the column path. For
 * an auto-detected dataset the authored plan has empty roles, so the order role
 * must be seeded from the detection-resolved roles — otherwise the order is
 * silently dropped and lost on the detect-schema resume.
 *
 * @module
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import type { DatasetInterpretationPlan, InterpretationRoles } from "@/lib/ingest/types/interpretation";

vi.mock("@/lib/api", () => ({
  apiRoute: (config: { handler: (...args: never[]) => unknown }) => config.handler,
  ForbiddenError: class extends Error {},
  safeFindByID: vi.fn(),
  ValidationError: class extends Error {},
}));

const { patchPlanFromBody } = await import("@/app/api/ingest-jobs/[id]/approve/route");

const emptyPlan = (): DatasetInterpretationPlan => ({ ops: [], columns: [], roles: {}, ambiguityResolution: "strict" });

const policyOrder = (plan: DatasetInterpretationPlan | null, field: string): string | undefined =>
  (plan?.columns.find((c) => c.field === field)?.policy as { order?: string } | undefined)?.order;

describe("patchPlanFromBody — order-pick persistence", () => {
  it("seeds the timestamp role from resolved roles so an order-only date pick lands on the column", () => {
    // Auto-detected dataset: authored plan has empty roles. Body carries only the
    // confirmed order; the resolved roles (from the job plan) name the column.
    const resolvedRoles: InterpretationRoles = { timestamp: "date" };
    const result = patchPlanFromBody(emptyPlan(), { timestampOrder: "D/M" }, resolvedRoles);

    expect(result).not.toBeNull();
    expect(result?.roles.timestamp).toBe("date");
    expect(result?.columns.find((c) => c.field === "date")?.kind).toBe("date");
    expect(policyOrder(result, "date")).toBe("DMY");
  });

  it("seeds the coordinate role from resolved roles for an order-only coordinate pick", () => {
    const resolvedRoles: InterpretationRoles = { coordinate: "coords" };
    const result = patchPlanFromBody(emptyPlan(), { coordinateFormat: "lng,lat" }, resolvedRoles);

    expect(result?.roles.coordinate).toBe("coords");
    expect(result?.columns.find((c) => c.field === "coords")?.kind).toBe("coordinate-pair");
    expect(policyOrder(result, "coords")).toBe("lng,lat");
  });

  it("drops the order when nothing names the column (regression guard for the seed)", () => {
    // No resolved roles + empty authored roles → no column to target. This is the
    // pre-fix behavior the resolved-role seed exists to prevent.
    const result = patchPlanFromBody(emptyPlan(), { timestampOrder: "D/M" });
    expect(result?.columns.find((c) => c.field === "date")).toBeUndefined();
  });

  it("prefers an explicit path pick over the resolved-role seed (wizard flow)", () => {
    const resolvedRoles: InterpretationRoles = { timestamp: "detected" };
    const result = patchPlanFromBody(emptyPlan(), { timestampPath: "when", timestampOrder: "M/D" }, resolvedRoles);

    expect(result?.roles.timestamp).toBe("when");
    expect(policyOrder(result, "when")).toBe("MDY");
    expect(result?.columns.find((c) => c.field === "detected")).toBeUndefined();
  });

  it("returns null when the body has no picks", () => {
    expect(patchPlanFromBody(emptyPlan(), {}, { timestamp: "date" })).toBeNull();
  });
});
