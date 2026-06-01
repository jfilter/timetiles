/**
 * Branch coverage for the {@link DatasetInterpretationPlan} builders (ADR 0040).
 *
 * Exercises the order-resolution branches that gate the ambiguous-order review:
 * explicit "D/M"/"M/D"/"lat,lng"/"lng,lat" must resolve to a concrete
 * `policy.order` with NO `requiresChoice`, while "ambiguous"/null/"" must leave
 * the order `undefined` and stamp `detection.requiresChoice`. Also pins the
 * legacy free-text <-> DateOrder/CoordinateOrder round-trips and asserts that an
 * undecided order projects back to `undefined` (NOT "ambiguous") through
 * {@link planToFieldMappings}.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  buildDetectionPlan,
  buildPlanFromPaths,
  coordinateOrderToLegacy,
  dateOrderToLegacyDayMonth,
  legacyDayMonthToDateOrder,
  pathsToRoles,
  planToFieldMappings,
  planToSchemaFieldMappings,
  toCoordinateOrder,
} from "@/lib/ingest/plan-builder";
import type { ColumnInterpretation, DatasetInterpretationPlan } from "@/lib/ingest/types/interpretation";

const columnFor = (
  plan: DatasetInterpretationPlan,
  field: string | null | undefined
): ColumnInterpretation | undefined => (field ? plan.columns.find((c) => c.field === field) : undefined);

const policyOrder = (plan: DatasetInterpretationPlan, field: string): string | undefined => {
  const policy = columnFor(plan, field)?.policy;
  return (policy as { order?: string } | undefined)?.order;
};

// No transforms => filterAuthoredOps / buildTransformsFromDataset short-circuits
// on the empty list, so no logger / dataset machinery is touched.
const NO_OPS: [] = [];

describe("buildDetectionPlan — order resolution + requiresChoice", () => {
  it("resolves explicit timestamp/endTimestamp/coordinate orders without requiresChoice", () => {
    const plan = buildDetectionPlan(
      NO_OPS,
      {
        timestampPath: "start",
        endTimestampPath: "end",
        coordinatePath: "coords",
        timestampOrder: "D/M",
        endTimestampOrder: "M/D",
        coordinateFormat: "lat,lng",
      },
      "strict"
    );

    expect(plan.roles.timestamp).toBe("start");
    expect(plan.roles.endTimestamp).toBe("end");
    expect(plan.roles.coordinate).toBe("coords");

    expect(policyOrder(plan, "start")).toBe("DMY");
    expect(policyOrder(plan, "end")).toBe("MDY");
    expect(policyOrder(plan, "coords")).toBe("lat,lng");

    expect(columnFor(plan, "start")?.detection?.requiresChoice).toBeUndefined();
    expect(columnFor(plan, "end")?.detection?.requiresChoice).toBeUndefined();
    expect(columnFor(plan, "coords")?.detection?.requiresChoice).toBeUndefined();
  });

  it("resolves the alternate coordinate order (lng,lat)", () => {
    const plan = buildDetectionPlan(NO_OPS, { coordinatePath: "coords", coordinateFormat: "lng,lat" }, "strict");
    expect(policyOrder(plan, "coords")).toBe("lng,lat");
    expect(columnFor(plan, "coords")?.detection?.requiresChoice).toBeUndefined();
  });

  it("flags requiresChoice and leaves order undefined for an explicit 'ambiguous' order", () => {
    const plan = buildDetectionPlan(
      NO_OPS,
      { timestampPath: "start", coordinatePath: "coords", timestampOrder: "ambiguous", coordinateFormat: "ambiguous" },
      "strict"
    );

    expect(policyOrder(plan, "start")).toBeUndefined();
    expect(policyOrder(plan, "coords")).toBeUndefined();
    expect(columnFor(plan, "start")?.detection?.requiresChoice).toBe("date-order");
    expect(columnFor(plan, "coords")?.detection?.requiresChoice).toBe("coordinate-order");
  });

  it("flags requiresChoice for null and empty-string orders (isUndecidedOrder)", () => {
    const planNull = buildDetectionPlan(
      NO_OPS,
      { timestampPath: "start", coordinatePath: "coords", timestampOrder: null, coordinateFormat: null },
      "strict"
    );
    expect(planNull.columns.find((c) => c.field === "start")?.detection?.requiresChoice).toBe("date-order");
    expect(planNull.columns.find((c) => c.field === "coords")?.detection?.requiresChoice).toBe("coordinate-order");

    const planEmpty = buildDetectionPlan(
      NO_OPS,
      { timestampPath: "start", coordinatePath: "coords", timestampOrder: "", coordinateFormat: "" },
      "strict"
    );
    expect(planEmpty.columns.find((c) => c.field === "start")?.detection?.requiresChoice).toBe("date-order");
    expect(planEmpty.columns.find((c) => c.field === "coords")?.detection?.requiresChoice).toBe("coordinate-order");
  });

  it("maps roles from the *Path inputs", () => {
    const plan = buildDetectionPlan(
      NO_OPS,
      {
        titlePath: "name",
        descriptionPath: "about",
        locationNamePath: "venue",
        timestampPath: "start",
        endTimestampPath: "end",
        locationPath: "addr",
        coordinatePath: "coords",
        latitudePath: "lat",
        longitudePath: "lng",
      },
      "best-effort"
    );

    expect(plan.roles).toMatchObject({
      title: "name",
      description: "about",
      locationName: "venue",
      timestamp: "start",
      endTimestamp: "end",
      location: "addr",
      coordinate: "coords",
      latitude: "lat",
      longitude: "lng",
    });
    expect(plan.ambiguityResolution).toBe("best-effort");
  });
});

describe("buildPlanFromPaths — authored order mapping + role projection", () => {
  it("maps explicit timestamp/endTimestamp/coordinate orders onto the column policies", () => {
    const plan = buildPlanFromPaths(
      {
        timestampPath: "start",
        endTimestampPath: "end",
        coordinatePath: "coords",
        timestampOrder: "M/D",
        endTimestampOrder: "D/M",
        coordinateFormat: "lng,lat",
      },
      NO_OPS,
      "strict"
    );

    expect(policyOrder(plan, "start")).toBe("MDY");
    expect(policyOrder(plan, "end")).toBe("DMY");
    expect(policyOrder(plan, "coords")).toBe("lng,lat");
  });

  it("projects pathsToRoles for the full role set", () => {
    const roles = pathsToRoles({
      titlePath: "name",
      descriptionPath: "about",
      locationNamePath: "venue",
      timestampPath: "start",
      endTimestampPath: "end",
      locationPath: "addr",
      coordinatePath: "coords",
      latitudePath: "lat",
      longitudePath: "lng",
      idPath: "uid",
    });

    expect(roles).toEqual({
      title: "name",
      description: "about",
      locationName: "venue",
      timestamp: "start",
      endTimestamp: "end",
      location: "addr",
      coordinate: "coords",
      latitude: "lat",
      longitude: "lng",
      id: "uid",
    });
  });

  it("nulls out unset roles (pathsToRoles default)", () => {
    const roles = pathsToRoles({ titlePath: "name" });
    expect(roles.title).toBe("name");
    expect(roles.timestamp).toBeNull();
    expect(roles.coordinate).toBeNull();
  });
});

describe("order converters — legacy free-text <-> DateOrder/CoordinateOrder round-trips", () => {
  it("round-trips day/month legacy <-> DateOrder", () => {
    expect(legacyDayMonthToDateOrder("D/M")).toBe("DMY");
    expect(legacyDayMonthToDateOrder("M/D")).toBe("MDY");
    expect(dateOrderToLegacyDayMonth("DMY")).toBe("D/M");
    expect(dateOrderToLegacyDayMonth("MDY")).toBe("M/D");
  });

  it("maps undecided date orders to undefined in both directions", () => {
    expect(legacyDayMonthToDateOrder("ambiguous")).toBeUndefined();
    expect(legacyDayMonthToDateOrder(null)).toBeUndefined();
    expect(legacyDayMonthToDateOrder("")).toBeUndefined();
    // Orders without a legacy day/month form yield no legacy token.
    expect(dateOrderToLegacyDayMonth(undefined)).toBeUndefined();
    expect(dateOrderToLegacyDayMonth("iso")).toBeUndefined();
    expect(dateOrderToLegacyDayMonth("YMD")).toBeUndefined();
  });

  it("round-trips coordinate order legacy <-> CoordinateOrder", () => {
    expect(toCoordinateOrder("lat,lng")).toBe("lat,lng");
    expect(toCoordinateOrder("lng,lat")).toBe("lng,lat");
    expect(coordinateOrderToLegacy("lat,lng")).toBe("lat,lng");
    expect(coordinateOrderToLegacy("lng,lat")).toBe("lng,lat");
  });

  it("normalizes undecided coordinate orders to undefined", () => {
    expect(toCoordinateOrder("ambiguous")).toBeUndefined();
    expect(toCoordinateOrder(null)).toBeUndefined();
    expect(toCoordinateOrder("")).toBeUndefined();
    expect(coordinateOrderToLegacy(undefined)).toBeUndefined();
  });
});

describe("planToFieldMappings — undecided order projects to undefined (not 'ambiguous')", () => {
  it("projects resolved orders back to the flat legacy field-mapping shape", () => {
    const plan = buildDetectionPlan(
      NO_OPS,
      {
        timestampPath: "start",
        endTimestampPath: "end",
        coordinatePath: "coords",
        timestampOrder: "D/M",
        endTimestampOrder: "M/D",
        coordinateFormat: "lat,lng",
      },
      "strict"
    );

    const mappings = planToFieldMappings(plan);
    expect(mappings.timestampPath).toBe("start");
    expect(mappings.endTimestampPath).toBe("end");
    expect(mappings.coordinatePath).toBe("coords");
    expect(mappings.timestampOrder).toBe("D/M");
    expect(mappings.endTimestampOrder).toBe("M/D");
    expect(mappings.coordinateFormat).toBe("lat,lng");
  });

  it("yields undefined (NOT 'ambiguous') for an undecided order", () => {
    const plan = buildDetectionPlan(
      NO_OPS,
      {
        timestampPath: "start",
        endTimestampPath: "end",
        coordinatePath: "coords",
        timestampOrder: "ambiguous",
        endTimestampOrder: null,
        coordinateFormat: "ambiguous",
      },
      "strict"
    );

    const mappings = planToFieldMappings(plan);
    expect(mappings.timestampOrder).toBeUndefined();
    expect(mappings.endTimestampOrder).toBeUndefined();
    expect(mappings.coordinateFormat).toBeUndefined();
    // The column path roles still project so the review gate can name the column.
    expect(mappings.timestampPath).toBe("start");
    expect(mappings.coordinatePath).toBe("coords");
  });

  it("returns an empty mapping for a null plan", () => {
    expect(planToFieldMappings(null)).toEqual({});
  });
});

describe("planToSchemaFieldMappings — five-field projection", () => {
  it("projects the title/description/locationName/timestamp/endTimestamp subset", () => {
    const plan = buildDetectionPlan(
      NO_OPS,
      {
        titlePath: "name",
        descriptionPath: "about",
        locationNamePath: "venue",
        timestampPath: "start",
        endTimestampPath: "end",
        // coordinate role present but intentionally excluded from the schema subset
        coordinatePath: "coords",
        coordinateFormat: "lat,lng",
      },
      "strict"
    );

    expect(planToSchemaFieldMappings(plan)).toEqual({
      titlePath: "name",
      descriptionPath: "about",
      locationNamePath: "venue",
      timestampPath: "start",
      endTimestampPath: "end",
    });
  });

  it("returns an empty mapping for a null plan", () => {
    expect(planToSchemaFieldMappings(null)).toEqual({});
  });
});
