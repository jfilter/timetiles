// @vitest-environment node
/**
 * Integration tests for hierarchical access control.
 *
 * Tests the catalog → dataset → event permission inheritance model,
 * verifying that access control works correctly across the hierarchy
 * with different public/private combinations and user ownership scenarios.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Catalog, Dataset, Event, User } from "@/payload-types";
import { createIntegrationTestEnvironment } from "@/tests/setup/test-environment-builder";

describe.sequential("Hierarchical Access Control", () => {
  let payload: any;
  let cleanup: () => Promise<void>;

  // Test users
  let adminUser: User;
  let ownerUser: User;
  let otherUser: User;

  // Test resources
  let publicCatalog: Catalog;
  let privateCatalog: Catalog;
  let publicDatasetInPublicCatalog: Dataset;
  let privateDatasetInPublicCatalog: Dataset;
  let publicDatasetInPrivateCatalog: Dataset;
  let privateDatasetInPrivateCatalog: Dataset;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test users
    adminUser = await payload.create({
      collection: "users",
      data: {
        email: "admin@access-test.com",
        password: "admin123456",
        role: "admin",
      },
    });

    ownerUser = await payload.create({
      collection: "users",
      data: {
        email: "owner@access-test.com",
        password: "owner123456",
        role: "user",
      },
    });

    otherUser = await payload.create({
      collection: "users",
      data: {
        email: "other@access-test.com",
        password: "other123456",
        role: "user",
      },
    });

    // Create test catalogs (as owner)
    publicCatalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Public Test Catalog",
        description: "A public catalog for testing",
        isPublic: true,
      },
      user: ownerUser,
    });

    privateCatalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Private Test Catalog",
        description: "A private catalog for testing",
        isPublic: false,
      },
      user: ownerUser,
    });

    // Create test datasets with various public/private combinations
    publicDatasetInPublicCatalog = await payload.create({
      collection: "datasets",
      data: {
        name: "Public Dataset in Public Catalog",
        description: "Should be accessible to everyone",
        catalog: publicCatalog.id,
        language: "eng",
        isPublic: true,
      },
      user: ownerUser,
    });

    privateDatasetInPublicCatalog = await payload.create({
      collection: "datasets",
      data: {
        name: "Private Dataset in Public Catalog",
        description: "Should only be accessible to owner and admin",
        catalog: publicCatalog.id,
        language: "eng",
        isPublic: false,
      },
      user: ownerUser,
    });

    publicDatasetInPrivateCatalog = await payload.create({
      collection: "datasets",
      data: {
        name: "Public Dataset in Private Catalog",
        description: "Dataset is public but catalog is private",
        catalog: privateCatalog.id,
        language: "eng",
        isPublic: true,
      },
      user: ownerUser,
    });

    privateDatasetInPrivateCatalog = await payload.create({
      collection: "datasets",
      data: {
        name: "Private Dataset in Private Catalog",
        description: "Both dataset and catalog are private",
        catalog: privateCatalog.id,
        language: "eng",
        isPublic: false,
      },
      user: ownerUser,
    });
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  describe("Catalog Access Control", () => {
    it("should allow anyone to read public catalogs", async () => {
      // Anonymous user
      const result = await payload.find({
        collection: "catalogs",
        where: { id: { equals: publicCatalog.id } },
        overrideAccess: false,
      });
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0].id).toBe(publicCatalog.id);

      // Other user
      const resultOther = await payload.find({
        collection: "catalogs",
        where: { id: { equals: publicCatalog.id } },
        user: otherUser,
        overrideAccess: false,
      });
      expect(resultOther.docs).toHaveLength(1);
    });

    it("should restrict private catalog access to owner and admin", async () => {
      // Anonymous user - should not see private catalog
      const resultAnon = await payload.find({
        collection: "catalogs",
        where: { id: { equals: privateCatalog.id } },
        overrideAccess: false,
      });
      expect(resultAnon.docs).toHaveLength(0);

      // Other user - should not see private catalog
      const resultOther = await payload.find({
        collection: "catalogs",
        where: { id: { equals: privateCatalog.id } },
        user: otherUser,
        overrideAccess: false,
      });
      expect(resultOther.docs).toHaveLength(0);

      // Owner - should see private catalog
      const resultOwner = await payload.find({
        collection: "catalogs",
        where: { id: { equals: privateCatalog.id } },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(resultOwner.docs).toHaveLength(1);

      // Admin - should see private catalog
      const resultAdmin = await payload.find({
        collection: "catalogs",
        where: { id: { equals: privateCatalog.id } },
        user: adminUser,
        overrideAccess: false,
      });
      expect(resultAdmin.docs).toHaveLength(1);
    });

    it("should prevent non-owner from updating catalog", async () => {
      await expect(
        payload.update({
          collection: "catalogs",
          id: publicCatalog.id,
          data: { name: "Hacked Catalog" },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("should allow owner to update their catalog", async () => {
      const updated = await payload.update({
        collection: "catalogs",
        id: publicCatalog.id,
        data: { name: "Updated Public Catalog" },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(updated.name).toBe("Updated Public Catalog");
    });

    it("should allow admin to update any catalog", async () => {
      const updated = await payload.update({
        collection: "catalogs",
        id: publicCatalog.id,
        data: { name: "Admin Updated Catalog" },
        user: adminUser,
        overrideAccess: false,
      });
      expect(updated.name).toBe("Admin Updated Catalog");
    });

    it("should prevent non-owner from deleting catalog", async () => {
      // Create a catalog to delete
      const tempCatalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Temp Catalog for Delete Test",
          isPublic: true,
        },
        user: ownerUser,
      });

      await expect(
        payload.delete({
          collection: "catalogs",
          id: tempCatalog.id,
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });
  });

  describe("Dataset Access Control with Inheritance", () => {
    it("should allow anyone to read public dataset in public catalog", async () => {
      // Anonymous user
      const result = await payload.find({
        collection: "datasets",
        where: { id: { equals: publicDatasetInPublicCatalog.id } },
        overrideAccess: false,
      });
      expect(result.docs).toHaveLength(1);

      // Other user
      const resultOther = await payload.find({
        collection: "datasets",
        where: { id: { equals: publicDatasetInPublicCatalog.id } },
        user: otherUser,
        overrideAccess: false,
      });
      expect(resultOther.docs).toHaveLength(1);
    });

    it("should restrict private dataset in public catalog to owner/admin", async () => {
      // Anonymous user - should not see
      const resultAnon = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPublicCatalog.id } },
        overrideAccess: false,
      });
      expect(resultAnon.docs).toHaveLength(0);

      // Other user - should not see
      const resultOther = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPublicCatalog.id } },
        user: otherUser,
        overrideAccess: false,
      });
      expect(resultOther.docs).toHaveLength(0);

      // Owner - should see
      const resultOwner = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPublicCatalog.id } },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(resultOwner.docs).toHaveLength(1);

      // Admin - should see
      const resultAdmin = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPublicCatalog.id } },
        user: adminUser,
        overrideAccess: false,
      });
      expect(resultAdmin.docs).toHaveLength(1);
    });

    it("should allow access to public dataset in private catalog only to owner/admin", async () => {
      // Anonymous user - catalog is private, so no access
      const resultAnon = await payload.find({
        collection: "datasets",
        where: { id: { equals: publicDatasetInPrivateCatalog.id } },
        overrideAccess: false,
      });
      expect(resultAnon.docs).toHaveLength(0);

      // Other user - catalog is private, so no access
      const resultOther = await payload.find({
        collection: "datasets",
        where: { id: { equals: publicDatasetInPrivateCatalog.id } },
        user: otherUser,
        overrideAccess: false,
      });
      expect(resultOther.docs).toHaveLength(0);

      // Owner - should see (owns catalog)
      const resultOwner = await payload.find({
        collection: "datasets",
        where: { id: { equals: publicDatasetInPrivateCatalog.id } },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(resultOwner.docs).toHaveLength(1);

      // Admin - should see
      const resultAdmin = await payload.find({
        collection: "datasets",
        where: { id: { equals: publicDatasetInPrivateCatalog.id } },
        user: adminUser,
        overrideAccess: false,
      });
      expect(resultAdmin.docs).toHaveLength(1);
    });

    it("should restrict private dataset in private catalog to owner/admin", async () => {
      // Anonymous user
      const resultAnon = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPrivateCatalog.id } },
        overrideAccess: false,
      });
      expect(resultAnon.docs).toHaveLength(0);

      // Other user
      const resultOther = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPrivateCatalog.id } },
        user: otherUser,
        overrideAccess: false,
      });
      expect(resultOther.docs).toHaveLength(0);

      // Owner
      const resultOwner = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPrivateCatalog.id } },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(resultOwner.docs).toHaveLength(1);

      // Admin
      const resultAdmin = await payload.find({
        collection: "datasets",
        where: { id: { equals: privateDatasetInPrivateCatalog.id } },
        user: adminUser,
        overrideAccess: false,
      });
      expect(resultAdmin.docs).toHaveLength(1);
    });

    it("should prevent non-owner from updating dataset", async () => {
      await expect(
        payload.update({
          collection: "datasets",
          id: publicDatasetInPublicCatalog.id,
          data: { name: "Hacked Dataset" },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("should allow catalog owner to update dataset", async () => {
      const updated = await payload.update({
        collection: "datasets",
        id: publicDatasetInPublicCatalog.id,
        data: { name: "Owner Updated Dataset" },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(updated.name).toBe("Owner Updated Dataset");
    });
  });

  describe("Event Access Control with Full Hierarchy", () => {
    let publicEvent: Event;
    let privateEvent: Event;

    beforeAll(async () => {
      // Create events in different datasets
      publicEvent = await payload.create({
        collection: "events",
        data: {
          dataset: publicDatasetInPublicCatalog.id,
          data: { test: "public event" },
          uniqueId: `${publicDatasetInPublicCatalog.id}:test:public-event`,
        },
        user: ownerUser,
      });

      privateEvent = await payload.create({
        collection: "events",
        data: {
          dataset: privateDatasetInPrivateCatalog.id,
          data: { test: "private event" },
          uniqueId: `${privateDatasetInPrivateCatalog.id}:test:private-event`,
        },
        user: ownerUser,
      });
    });

    it("should allow anyone to read event in public dataset/catalog", async () => {
      // Anonymous user
      const event = await payload.findByID({
        collection: "events",
        id: publicEvent.id,
        overrideAccess: false,
      });
      expect(event.id).toBe(publicEvent.id);

      // Other user
      const eventOther = await payload.findByID({
        collection: "events",
        id: publicEvent.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(eventOther.id).toBe(publicEvent.id);
    });

    it("should restrict event access based on dataset and catalog privacy", async () => {
      // Other user cannot read event in private dataset/catalog
      await expect(
        payload.findByID({
          collection: "events",
          id: privateEvent.id,
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      // Owner can read
      const eventOwner = await payload.findByID({
        collection: "events",
        id: privateEvent.id,
        user: ownerUser,
        overrideAccess: false,
      });
      expect(eventOwner.id).toBe(privateEvent.id);

      // Admin can read
      const eventAdmin = await payload.findByID({
        collection: "events",
        id: privateEvent.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(eventAdmin.id).toBe(privateEvent.id);
    });

    it("should prevent non-owner from updating event", async () => {
      await expect(
        payload.update({
          collection: "events",
          id: publicEvent.id,
          data: { data: { test: "hacked" } },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("should allow catalog owner to update event", async () => {
      const updated = await payload.update({
        collection: "events",
        id: publicEvent.id,
        data: { data: { test: "updated by owner" } },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(updated.data.test).toBe("updated by owner");
    });

    it("should prevent non-owner from deleting event", async () => {
      await expect(
        payload.delete({
          collection: "events",
          id: publicEvent.id,
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });
  });

  describe("Cross-User Access Restrictions", () => {
    it("should not allow user to see other user's private catalogs", async () => {
      const catalogs = await payload.find({
        collection: "catalogs",
        user: otherUser,
        overrideAccess: false,
      });

      // otherUser should only see public catalogs, not ownerUser's private catalog
      const privateCatalogVisible = catalogs.docs.some((cat: Catalog) => cat.id === privateCatalog.id);
      expect(privateCatalogVisible).toBe(false);
    });

    it("should not allow user to create dataset in another user's private catalog", async () => {
      await expect(
        payload.create({
          collection: "datasets",
          data: {
            name: "Unauthorized Dataset",
            catalog: privateCatalog.id,
            language: "eng",
          },
          user: otherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("should allow user to create dataset in public catalog", async () => {
      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Dataset by Other User",
          catalog: publicCatalog.id,
          language: "eng",
          isPublic: true, // Make it public so otherUser can read it back
        },
        user: otherUser,
        overrideAccess: false,
      });
      expect(dataset.name).toBe("Dataset by Other User");

      // Verify otherUser can read the public dataset they created
      const datasetCheck = await payload.findByID({
        collection: "datasets",
        id: dataset.id,
        user: otherUser,
        overrideAccess: false,
      });
      expect(datasetCheck.id).toBe(dataset.id);
    });
  });

  describe("Admin Override", () => {
    it("should allow admin to access all catalogs regardless of privacy", async () => {
      const allCatalogs = await payload.find({
        collection: "catalogs",
        user: adminUser,
        overrideAccess: false,
      });

      const hasPublicCatalog = allCatalogs.docs.some((cat: Catalog) => cat.id === publicCatalog.id);
      const hasPrivateCatalog = allCatalogs.docs.some((cat: Catalog) => cat.id === privateCatalog.id);

      expect(hasPublicCatalog).toBe(true);
      expect(hasPrivateCatalog).toBe(true);
    });

    it("should allow admin to update any resource", async () => {
      const updated = await payload.update({
        collection: "datasets",
        id: privateDatasetInPrivateCatalog.id,
        data: { name: "Admin Updated Private Dataset" },
        user: adminUser,
        overrideAccess: false,
      });
      expect(updated.name).toBe("Admin Updated Private Dataset");
    });

    it("should allow admin to delete any resource", async () => {
      // Create a temporary event to delete
      const tempEvent = await payload.create({
        collection: "events",
        data: {
          dataset: privateDatasetInPrivateCatalog.id,
          data: { test: "to be deleted" },
          uniqueId: `${privateDatasetInPrivateCatalog.id}:test:temp-${Date.now()}`,
        },
        user: ownerUser,
      });

      // Admin can delete it
      await payload.delete({
        collection: "events",
        id: tempEvent.id,
        user: adminUser,
        overrideAccess: false,
      });

      // Verify deletion
      await expect(
        payload.findByID({
          collection: "events",
          id: tempEvent.id,
          user: adminUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });
  });

  describe("Version History Access", () => {
    it("should restrict version history to admins only", async () => {
      // Create and update a catalog to generate versions
      const testCatalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Version Test Catalog",
          isPublic: true,
        },
        user: ownerUser,
      });

      await payload.update({
        collection: "catalogs",
        id: testCatalog.id,
        data: { name: "Version Test Catalog v2" },
        user: ownerUser,
      });

      // Owner should not be able to read versions (only admins can)
      // Note: Payload may throw an error or return empty results
      // The access control is enforced at the collection level
      let ownerVersionsError = false;
      try {
        await payload.findVersions({
          collection: "catalogs",
          where: {
            parent: { equals: testCatalog.id },
          },
          user: ownerUser,
          overrideAccess: false,
        });
      } catch {
        // Expected - owner cannot access version history
        ownerVersionsError = true;
      }

      // Owner should be blocked (either error or empty results)
      expect(ownerVersionsError).toBe(true);

      // Admin should be able to access versions
      const adminVersions = await payload.findVersions({
        collection: "catalogs",
        where: {
          parent: { equals: testCatalog.id },
        },
        user: adminUser,
        overrideAccess: false,
      });

      expect(adminVersions.docs.length).toBeGreaterThan(0);
    });
  });
});
