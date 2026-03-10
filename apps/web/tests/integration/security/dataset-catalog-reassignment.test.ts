// @vitest-environment node
/**
 * Security tests verifying datasets cannot be reassigned to foreign catalogs.
 *
 * The vulnerability: the target-catalog permission check only runs on create.
 * A catalog owner can update one of their datasets and change its catalog
 * to another user's private catalog, injecting content they don't control.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { extractRelationId } from "@/lib/utils/relation-id";
import type { Catalog, Dataset, User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Dataset Catalog Reassignment Vulnerability", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let adminUser: User;
  let userA: User;
  let userB: User;

  let catalogA: Catalog;
  let catalogA2: Catalog;
  let catalogB: Catalog;
  let publicCatalog: Catalog;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, {
      adminUser: { role: "admin" },
      userA: { role: "user" },
      userB: { role: "user" },
    });
    adminUser = users.adminUser;
    userA = users.userA;
    userB = users.userB;

    // Create catalogs once to avoid quota issues
    const catAResult = await withCatalog(testEnv, {
      name: "UserA Private Catalog",
      isPublic: false,
      user: userA,
    });
    catalogA = catAResult.catalog;

    const catA2Result = await withCatalog(testEnv, {
      name: "UserA Second Catalog",
      isPublic: false,
      user: userA,
    });
    catalogA2 = catA2Result.catalog;

    const catBResult = await withCatalog(testEnv, {
      name: "UserB Private Catalog",
      isPublic: false,
      user: userB,
    });
    catalogB = catBResult.catalog;

    const pubCatResult = await withCatalog(testEnv, {
      name: "Public Catalog",
      isPublic: true,
      user: userA,
    });
    publicCatalog = pubCatResult.catalog;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  /** Helper to create a fresh dataset in catalogA for each test */
  const createDatasetInCatalogA = async (): Promise<Dataset> => {
    const result = await withDataset(testEnv, catalogA.id, {
      name: `Test Dataset ${Date.now()}`,
      isPublic: false,
    });
    return result.dataset;
  };

  describe("Vulnerability: catalog reassignment to foreign catalog", () => {
    it("should reject moving dataset to another user's private catalog", async () => {
      const dataset = await createDatasetInCatalogA();

      // UserA tries to move their dataset into UserB's private catalog
      await expect(
        payload.update({
          collection: "datasets",
          id: dataset.id,
          data: {
            catalog: catalogB.id,
          },
          user: userA,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });
  });

  describe("Legitimate access after fix", () => {
    it("admin can reassign dataset to any catalog", async () => {
      const dataset = await createDatasetInCatalogA();

      const updated = await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: {
          catalog: catalogB.id,
        },
        user: adminUser,
        overrideAccess: false,
      });
      const updatedCatalogId = extractRelationId(updated.catalog);
      expect(updatedCatalogId).toBe(catalogB.id);
    });

    it("userA can move dataset to a public catalog", async () => {
      const dataset = await createDatasetInCatalogA();

      const updated = await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: {
          catalog: publicCatalog.id,
          isPublic: true,
        },
        user: userA,
        overrideAccess: false,
      });
      const updatedCatalogId = extractRelationId(updated.catalog);
      expect(updatedCatalogId).toBe(publicCatalog.id);
    });

    it("userA can move dataset between their own catalogs", async () => {
      const dataset = await createDatasetInCatalogA();

      const updated = await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: {
          catalog: catalogA2.id,
        },
        user: userA,
        overrideAccess: false,
      });
      const updatedCatalogId = extractRelationId(updated.catalog);
      expect(updatedCatalogId).toBe(catalogA2.id);
    });
  });
});
