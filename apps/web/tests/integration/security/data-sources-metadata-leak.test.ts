// @vitest-environment node
/**
 * Security tests verifying /api/v1/data-sources respects collection access rules.
 *
 * The vulnerability: the endpoint queried datasets with only `isPublic: true`
 * but did not check `catalogIsPublic: true` and had no user context, leaking
 * dataset metadata that the real access rules would hide.
 *
 * Verifies both collection access rules and the anonymous API response.
 *
 * @module
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/data-sources/route";
import type { DataSourcesResponse } from "@/lib/types/data-sources";
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
  let publicCatalogId: number;
  let publicDatasetId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { adminUser: { role: "admin" }, ownerUser: { role: "user" } });
    adminUser = users.adminUser;
    ownerUser = users.ownerUser;

    // Create a private catalog with a private dataset inside it.
    const privateCatResult = await withCatalog(testEnv, {
      name: "Owner Private Catalog",
      isPublic: false,
      user: ownerUser,
    });

    // Private metadata must remain hidden from non-owners.
    await withDataset(testEnv, privateCatResult.catalog.id, {
      name: "Leaked Dataset In Private Catalog",
      isPublic: false,
    });

    // Create a public catalog with a public dataset — should be visible to everyone
    const publicCatResult = await withCatalog(testEnv, { name: "Public Catalog", isPublic: true, user: ownerUser });

    publicCatalogId = publicCatResult.catalog.id;
    const publicDataset = await withDataset(testEnv, publicCatalogId, {
      name: "Visible Public Dataset",
      isPublic: true,
      description: {
        root: {
          type: "root",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          children: [
            {
              type: "paragraph",
              version: 1,
              direction: null,
              format: "",
              indent: 0,
              children: ["Time", "Tiles!"].map((text, format) => ({
                type: "text",
                version: 1,
                text,
                format,
                detail: 0,
                mode: "normal",
                style: "",
              })),
            },
          ],
        },
      },
    });
    publicDatasetId = publicDataset.dataset.id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  describe("Vulnerability: private catalog datasets leaked", () => {
    it("anonymous API responses expose only accessible metadata with intact descriptions", async () => {
      const response = await GET(new NextRequest("http://localhost:3000/api/v1/data-sources"), {
        params: Promise.resolve({}),
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as DataSourcesResponse;
      expect(data.catalogs.map((catalog) => catalog.name)).not.toContain("Owner Private Catalog");
      expect(data.datasets.map((dataset) => dataset.name)).not.toContain("Leaked Dataset In Private Catalog");
      expect(data.datasets).toContainEqual(
        expect.objectContaining({ id: publicDatasetId, catalogId: publicCatalogId, description: "TimeTiles!" })
      );
    });

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
