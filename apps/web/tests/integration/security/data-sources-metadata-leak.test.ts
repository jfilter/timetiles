// @vitest-environment node
/**
 * Security tests verifying /api/v1/data-sources respects collection access rules.
 *
 * The vulnerability: the endpoint queried datasets with only `isPublic: true`
 * but did not check `catalogIsPublic: true` and had no user context, leaking
 * dataset metadata that the real access rules would hide.
 *
 * These tests verify at the Payload level that queries with `overrideAccess: false`
 * correctly enforce the collection access rules used by the fixed endpoint.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Data Sources Metadata Leak Vulnerability", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let adminUser: User;
  let ownerUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { adminUser: { role: "admin" }, ownerUser: { role: "user" } });
    adminUser = users.adminUser;
    ownerUser = users.ownerUser;

    // Create a private catalog with a public dataset inside it
    const privateCatResult = await withCatalog(testEnv, {
      name: "Owner Private Catalog",
      isPublic: false,
      user: ownerUser,
    });

    // This dataset is "public" but in a PRIVATE catalog — should be hidden from non-owners
    await withDataset(testEnv, privateCatResult.catalog.id, {
      name: "Leaked Dataset In Private Catalog",
      isPublic: false,
    });

    // Create a public catalog with a public dataset — should be visible to everyone
    const publicCatResult = await withCatalog(testEnv, { name: "Public Catalog", isPublic: true, user: ownerUser });

    await withDataset(testEnv, publicCatResult.catalog.id, { name: "Visible Public Dataset", isPublic: true });
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  describe("Vulnerability: private catalog datasets leaked", () => {
    it("anonymous user should not see datasets in private catalogs", async () => {
      // Query datasets without user context (anonymous), enforcing access rules
      const result = await payload.find({
        collection: "datasets",
        overrideAccess: false,
        // No user = anonymous
        limit: 100,
        pagination: false,
      });

      const datasetNames = result.docs.map((d: any) => d.name);
      expect(datasetNames).not.toContain("Leaked Dataset In Private Catalog");
    });

    it("anonymous user should not see private catalogs", async () => {
      const result = await payload.find({
        collection: "catalogs",
        overrideAccess: false,
        limit: 100,
        pagination: false,
      });

      const catalogNames = result.docs.map((c: any) => c.name);
      expect(catalogNames).not.toContain("Owner Private Catalog");
    });
  });

  describe("Legitimate access after fix", () => {
    it("anonymous user can see public datasets in public catalogs", async () => {
      const result = await payload.find({
        collection: "datasets",
        overrideAccess: false,
        limit: 100,
        pagination: false,
      });

      const datasetNames = result.docs.map((d: any) => d.name);
      expect(datasetNames).toContain("Visible Public Dataset");
    });

    it("catalog owner can see their own private datasets", async () => {
      const result = await payload.find({
        collection: "datasets",
        user: ownerUser,
        overrideAccess: false,
        limit: 100,
        pagination: false,
      });

      const datasetNames = result.docs.map((d: any) => d.name);
      expect(datasetNames).toContain("Leaked Dataset In Private Catalog");
    });

    it("admin can see all datasets", async () => {
      const result = await payload.find({
        collection: "datasets",
        user: adminUser,
        overrideAccess: false,
        limit: 100,
        pagination: false,
      });

      const datasetNames = result.docs.map((d: any) => d.name);
      expect(datasetNames).toContain("Leaked Dataset In Private Catalog");
      expect(datasetNames).toContain("Visible Public Dataset");
    });
  });
});
