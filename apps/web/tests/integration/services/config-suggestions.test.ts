/**
 * Integration tests for config suggestions feature.
 *
 * Tests `findConfigSuggestionsForUser` which queries a user's datasets and
 * returns matching config suggestions based on column header overlap. This
 * validates the full flow from real database queries through the pure matching
 * logic.
 *
 * @module
 * @category Integration Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { findConfigSuggestionsForUser } from "@/app/api/ingest/preview-schema/helpers";

import { createIntegrationTestEnvironment, withCatalog, withUsers } from "../../setup/integration/environment";

describe.sequential("Config Suggestions - Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testUser: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    testUser = users.testUser;
  });

  it("should return matching suggestions for similar headers", async () => {
    const { catalog } = await withCatalog(testEnv, { user: testUser });

    await payload.create({
      collection: "datasets",
      data: {
        name: `Config Match Dataset ${Date.now()}`,
        slug: `config-match-${Date.now()}`,
        catalog: catalog.id,
        language: "eng",
        fieldMappingOverrides: { titlePath: "title", timestampPath: "date", locationNamePath: "location" },
        idStrategy: { type: "auto" },
      },
    });

    const headers = ["title", "date", "location", "extra_col"];
    const suggestions = await findConfigSuggestionsForUser(payload, testUser.id, headers);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    const match = suggestions.find((s) => s.matchedColumns.length >= 3);
    expect(match).toBeDefined();
    expect(match!.score).toBeGreaterThanOrEqual(40);
    expect(match!.matchedColumns).toEqual(expect.arrayContaining(["title", "date", "location"]));
    expect(match!.config.fieldMappingOverrides.titlePath).toBe("title");
    expect(match!.config.fieldMappingOverrides.timestampPath).toBe("date");
    expect(match!.config.fieldMappingOverrides.locationNamePath).toBe("location");
  });

  it("should return empty when no datasets match", async () => {
    const { catalog } = await withCatalog(testEnv, { user: testUser });

    await payload.create({
      collection: "datasets",
      data: {
        name: `No Match Dataset ${Date.now()}`,
        slug: `no-match-${Date.now()}`,
        catalog: catalog.id,
        language: "eng",
        fieldMappingOverrides: { titlePath: "alpha", timestampPath: "beta", locationNamePath: "gamma" },
      },
    });

    const headers = ["x_col", "y_col", "z_col"];
    const suggestions = await findConfigSuggestionsForUser(payload, testUser.id, headers);

    // No dataset's known columns overlap with these headers above the threshold
    const matchingOurDataset = suggestions.filter((s) =>
      s.matchedColumns.some((c) => ["alpha", "beta", "gamma"].includes(c))
    );
    expect(matchingOurDataset).toHaveLength(0);
  });

  it("should include transforms in matched config", async () => {
    const { catalog } = await withCatalog(testEnv, { user: testUser });

    const transforms = [
      {
        id: crypto.randomUUID(),
        type: "rename" as const,
        from: "raw_date",
        to: "date",
        active: true,
        autoDetected: false,
      },
      {
        id: crypto.randomUUID(),
        type: "rename" as const,
        from: "raw_name",
        to: "name",
        active: true,
        autoDetected: false,
      },
    ];

    await payload.create({
      collection: "datasets",
      data: {
        name: `Transform Config Dataset ${Date.now()}`,
        slug: `transform-config-${Date.now()}`,
        catalog: catalog.id,
        language: "eng",
        fieldMappingOverrides: { titlePath: "name", timestampPath: "date", locationNamePath: "location" },
        ingestTransforms: transforms,
        idStrategy: { type: "auto" },
      },
    });

    // Use headers that match known columns: "name" from overrides, "raw_date" and "raw_name" from transforms
    const headers = ["raw_date", "raw_name", "location"];
    const suggestions = await findConfigSuggestionsForUser(payload, testUser.id, headers);

    const match = suggestions.find((s) => s.matchedColumns.includes("raw_date"));
    expect(match).toBeDefined();
    expect(match!.config.ingestTransforms).toBeDefined();
    expect(match!.config.ingestTransforms!.length).toBeGreaterThanOrEqual(2);
  });

  it("should rank multiple datasets by score (best match first)", async () => {
    const { catalog } = await withCatalog(testEnv, { user: testUser });

    // Dataset with fewer matching columns
    await payload.create({
      collection: "datasets",
      data: {
        name: `Low Match Dataset ${Date.now()}`,
        slug: `low-match-${Date.now()}`,
        catalog: catalog.id,
        language: "eng",
        fieldMappingOverrides: { titlePath: "title", timestampPath: "date" },
      },
    });

    // Dataset with more matching columns
    const highMatchDataset = await payload.create({
      collection: "datasets",
      data: {
        name: `High Match Dataset ${Date.now()}`,
        slug: `high-match-${Date.now()}`,
        catalog: catalog.id,
        language: "eng",
        fieldMappingOverrides: {
          titlePath: "title",
          timestampPath: "date",
          locationNamePath: "location",
          descriptionPath: "description",
        },
      },
    });

    const headers = ["title", "date", "location", "description"];
    const suggestions = await findConfigSuggestionsForUser(payload, testUser.id, headers);

    // Filter to only suggestions from this test's datasets (scoped by catalog)
    const catalogSuggestions = suggestions.filter((s) => s.catalogName === catalog.name);

    expect(catalogSuggestions.length).toBeGreaterThanOrEqual(2);
    // Best match should come first
    expect(catalogSuggestions[0]!.datasetId).toBe(highMatchDataset.id);
    expect(catalogSuggestions[0]!.score).toBeGreaterThan(catalogSuggestions[1]!.score);
  });
});
