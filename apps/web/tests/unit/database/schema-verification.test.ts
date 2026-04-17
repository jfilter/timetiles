/**
 * Unit tests for critical SQL function verification.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { findFunctionDefinitionIssues } from "@/tests/setup/integration/schema-verification";

describe("findFunctionDefinitionIssues", () => {
  it("returns no issues when critical functions satisfy the expected invariants", () => {
    const issues = findFunctionDefinitionIssues([
      {
        name: "cluster_events",
        definition: `
          ST_Intersects(e.geom, CASE WHEN p_min_lng <= p_max_lng THEN true END)
          COALESCE((p_filters->>'includePublic')::boolean, true)
          e.dataset_is_public = true
          e.catalog_owner_id = (p_filters->>'ownerId')::int
        `,
      },
      {
        name: "calculate_event_histogram",
        definition: `
          CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= 1 THEN true END
          COALESCE((p_filters->>'includePublic')::boolean, true)
          e.dataset_is_public = true
          e.catalog_owner_id = (p_filters->>'ownerId')::int
        `,
      },
      {
        name: "cluster_events_temporal",
        definition: `
          CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= 1 THEN true END
          COALESCE((p_filters->>'includePublic')::boolean, true)
          e.dataset_is_public = true
          e.catalog_owner_id = (p_filters->>'ownerId')::int
        `,
      },
    ]);

    expect(issues).toEqual([]);
  });

  it("reports missing critical functions", () => {
    const issues = findFunctionDefinitionIssues([]);

    expect(issues).toContain("Missing required SQL function: cluster_events");
    expect(issues).toContain("Missing required SQL function: calculate_event_histogram");
    expect(issues).toContain("Missing required SQL function: cluster_events_temporal");
  });

  it("reports forbidden stale SQL defaults", () => {
    const issues = findFunctionDefinitionIssues([
      {
        name: "cluster_events",
        definition: `
          ST_Intersects(e.geom, CASE WHEN p_min_lng <= p_max_lng THEN true END)
          COALESCE((p_filters->>'includePublic')::boolean, false)
          e.dataset_is_public = true
          e.catalog_owner_id = (p_filters->>'ownerId')::int
        `,
      },
      {
        name: "calculate_event_histogram",
        definition: `
          CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= 1 THEN true END
          COALESCE((p_filters->>'includePublic')::boolean, false)
          e.dataset_is_public = true
          e.catalog_owner_id = (p_filters->>'ownerId')::int
        `,
      },
      {
        name: "cluster_events_temporal",
        definition: `
          CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= 1 THEN true END
          COALESCE((p_filters->>'includePublic')::boolean, false)
          e.dataset_is_public = true
          e.catalog_owner_id = (p_filters->>'ownerId')::int
        `,
      },
    ]);

    expect(issues).toContain(
      "Function cluster_events still contains forbidden SQL: COALESCE((p_filters->>'includePublic')::boolean, false)"
    );
    expect(issues).toContain(
      "Function calculate_event_histogram still contains forbidden SQL: COALESCE((p_filters->>'includePublic')::boolean, false)"
    );
    expect(issues).toContain(
      "Function cluster_events_temporal still contains forbidden SQL: COALESCE((p_filters->>'includePublic')::boolean, false)"
    );
  });
});
