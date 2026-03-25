// @vitest-environment node
/**
 * Integration tests for catalog beforeChange and afterDelete hooks:
 * - validateSlugUniqueness: prevents duplicate catalog slugs
 * - checkAndIncrementQuota: enforces CATALOGS_PER_USER limit
 * - afterDelete quota decrement: releases quota on catalog deletion
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Catalog validation hooks", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;

  let ownerUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { owner: { role: "user" } });
    ownerUser = users.owner;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  describe("validateSlugUniqueness", () => {
    it("rejects creating a catalog with a duplicate slug", async () => {
      const slug = `unique-slug-${Date.now()}`;
      await payload.create({
        collection: "catalogs",
        data: { name: "First Catalog", slug, isPublic: true, createdBy: ownerUser.id },
        overrideAccess: true,
      });

      await expect(
        payload.create({
          collection: "catalogs",
          data: { name: "Second Catalog", slug, isPublic: true, createdBy: ownerUser.id },
          overrideAccess: true,
        })
      ).rejects.toThrow(/slug/i);
    });

    it("allows creating catalogs with different slugs", async () => {
      const ts = Date.now();
      const cat1 = await payload.create({
        collection: "catalogs",
        data: { name: "Cat A", slug: `slug-a-${ts}`, isPublic: true, createdBy: ownerUser.id },
        overrideAccess: true,
      });
      const cat2 = await payload.create({
        collection: "catalogs",
        data: { name: "Cat B", slug: `slug-b-${ts}`, isPublic: true, createdBy: ownerUser.id },
        overrideAccess: true,
      });

      expect(cat1.slug).toBe(`slug-a-${ts}`);
      expect(cat2.slug).toBe(`slug-b-${ts}`);
    });

    it("allows updating a catalog to keep its own slug", async () => {
      const slug = `keep-slug-${Date.now()}`;
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: "Keep Slug", slug, isPublic: true, createdBy: ownerUser.id },
        overrideAccess: true,
      });

      const updated = await payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { name: "Renamed", slug },
        overrideAccess: true,
      });
      expect(updated.slug).toBe(slug);
    });

    it("auto-generates unique slug when updating to a conflicting slug", async () => {
      const ts = Date.now();
      const slugA = `conflict-a-${ts}`;
      const slugB = `conflict-b-${ts}`;

      await payload.create({
        collection: "catalogs",
        data: { name: "Cat A", slug: slugA, isPublic: true, createdBy: ownerUser.id },
        overrideAccess: true,
      });
      const catB = await payload.create({
        collection: "catalogs",
        data: { name: "Cat B", slug: slugB, isPublic: true, createdBy: ownerUser.id },
        overrideAccess: true,
      });

      // The field-level beforeValidate hook auto-generates a unique slug
      const updated = await payload.update({
        collection: "catalogs",
        id: catB.id,
        data: { slug: slugA },
        overrideAccess: true,
      });
      expect(updated.slug).not.toBe(slugA);
      expect(updated.slug).toContain("conflict-a");
    });
  });

  describe("checkAndIncrementQuota / afterDelete decrement", () => {
    // Helper: create user with a specific catalog quota
    const createUserWithCatalogQuota = async (key: string, maxCatalogs: number) => {
      const { users } = await withUsers(testEnv, { [key]: { role: "user" } });
      const user = users[key];
      // Set the catalog quota directly (not exposed in withUsers quotas interface)
      return payload.update({
        collection: "users",
        id: user.id,
        data: { quotas: { maxCatalogsPerUser: maxCatalogs } },
        overrideAccess: true,
      });
    };

    it("enforces CATALOGS_PER_USER quota", async () => {
      const limitedUser = await createUserWithCatalogQuota(`lim-${Date.now()}`, 2);

      // Create catalogs up to the limit
      await payload.create({
        collection: "catalogs",
        data: { name: `Quota Cat 1 ${Date.now()}`, isPublic: true },
        user: limitedUser,
      });
      await payload.create({
        collection: "catalogs",
        data: { name: `Quota Cat 2 ${Date.now()}`, isPublic: true },
        user: limitedUser,
      });

      // Third should exceed quota
      await expect(
        payload.create({
          collection: "catalogs",
          data: { name: `Quota Cat 3 ${Date.now()}`, isPublic: true },
          user: limitedUser,
        })
      ).rejects.toThrow(/Maximum catalogs reached/);
    });

    it("releases quota when a catalog is deleted", async () => {
      const delUser = await createUserWithCatalogQuota(`del-${Date.now()}`, 2);

      const cat1 = await payload.create({
        collection: "catalogs",
        data: { name: `Del Cat 1 ${Date.now()}`, isPublic: true },
        user: delUser,
      });
      await payload.create({
        collection: "catalogs",
        data: { name: `Del Cat 2 ${Date.now()}`, isPublic: true },
        user: delUser,
      });

      // At quota limit — can't create more
      await expect(
        payload.create({
          collection: "catalogs",
          data: { name: `Del Cat 3 ${Date.now()}`, isPublic: true },
          user: delUser,
        })
      ).rejects.toThrow(/Maximum catalogs reached/);

      // Delete one catalog
      await payload.delete({ collection: "catalogs", id: cat1.id, overrideAccess: true });

      // Now can create again
      const cat3 = await payload.create({
        collection: "catalogs",
        data: { name: `Del Cat 3 ${Date.now()}`, isPublic: true },
        user: delUser,
      });
      expect(cat3.id).toBeDefined();
    });

    it("skips quota check when no user context (overrideAccess)", async () => {
      // Creating without user context should bypass quota
      const catalog = await payload.create({
        collection: "catalogs",
        data: { name: `No User ${Date.now()}`, isPublic: true, createdBy: ownerUser.id },
        overrideAccess: true,
      });
      expect(catalog.id).toBeDefined();
    });
  });
});
