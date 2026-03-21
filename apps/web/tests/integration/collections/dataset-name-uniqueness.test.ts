// @vitest-environment node
/**
 * Tests that dataset names are unique within a catalog.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Catalog, User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Dataset name uniqueness per catalog", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let user: User;
  let catalogA: Catalog;
  let catalogB: Catalog;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { owner: { role: "user" } });
    user = users.owner;

    const catA = await withCatalog(testEnv, { name: "Catalog A", isPublic: false, user });
    catalogA = catA.catalog;

    const catB = await withCatalog(testEnv, { name: "Catalog B", isPublic: false, user });
    catalogB = catB.catalog;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  it("rejects creating a dataset with a duplicate name in the same catalog", async () => {
    const name = `Unique Test ${Date.now()}`;
    await withDataset(testEnv, catalogA.id, { name });

    await expect(withDataset(testEnv, catalogA.id, { name })).rejects.toThrow(
      "A dataset with this name already exists in this catalog."
    );
  });

  it("allows creating datasets with the same name in different catalogs", async () => {
    const name = `Cross Catalog ${Date.now()}`;
    await withDataset(testEnv, catalogA.id, { name });

    const { dataset } = await withDataset(testEnv, catalogB.id, { name });
    expect(dataset.name).toBe(name);
  });

  it("rejects updating a dataset name to conflict with another in the same catalog", async () => {
    const nameA = `Dataset A ${Date.now()}`;
    const nameB = `Dataset B ${Date.now()}`;
    await withDataset(testEnv, catalogA.id, { name: nameA });
    const { dataset: datasetB } = await withDataset(testEnv, catalogA.id, { name: nameB });

    await expect(
      payload.update({ collection: "datasets", id: datasetB.id, data: { name: nameA }, overrideAccess: true })
    ).rejects.toThrow("A dataset with this name already exists in this catalog.");
  });

  it("allows updating a dataset while keeping its own name", async () => {
    const name = `Keep Name ${Date.now()}`;
    const { dataset } = await withDataset(testEnv, catalogA.id, { name });

    const updated = await payload.update({
      collection: "datasets",
      id: dataset.id,
      data: { name },
      overrideAccess: true,
    });
    expect(updated.name).toBe(name);
  });
});
