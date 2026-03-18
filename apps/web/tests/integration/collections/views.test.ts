// @vitest-environment node
/**
 * Integration tests for the Views collection.
 *
 * Tests CRUD operations, access control, single default enforcement,
 * and view resolution by slug and default (within a site).
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { clearSiteCache } from "@/lib/services/resolution/site-resolver";
import { clearViewCache, findDefaultView, findViewBySlug, resolveView } from "@/lib/services/resolution/view-resolver";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Site, User, View } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Views Collection", () => {
  const collectionsToReset = ["views", "sites"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;

  // Test users
  let adminUser: User;
  let regularUser: User;
  let otherUser: User;

  // Test site
  let testSite: Site;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, {
      admin: { role: "admin" },
      regular: { role: "user" },
      other: { role: "user" },
    });
    adminUser = users.admin;
    regularUser = users.regular;
    otherUser = users.other;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
    clearViewCache();
    clearSiteCache();

    // Create a test site for views
    testSite = await payload.create({
      collection: "sites",
      data: { name: "Test Site", slug: "test-site", isPublic: true, _status: "published" },
      user: regularUser,
    });
  });

  describe("CRUD Operations", () => {
    it("should create a view with all fields", async () => {
      const view = await payload.create({
        collection: "views",
        data: {
          name: "Test View",
          slug: "test-view",
          site: testSite.id,
          isDefault: false,
          isPublic: true,
          _status: "published",
          dataScope: { mode: "all" },
          filterConfig: { mode: "auto", maxFilters: 5 },
          mapSettings: {
            defaultZoom: 10,
            defaultCenter: { latitude: 40.7128, longitude: -74.006 },
            baseMapStyle: "light",
          },
        },
        user: regularUser,
      });

      expect(view.id).toBeDefined();
      expect(view.name).toBe("Test View");
      expect(view.slug).toBe("test-view");
      expect(extractRelationId(view.site)).toBe(testSite.id);
      expect(view.mapSettings?.defaultZoom).toBe(10);
      // createdBy can be populated (object) or just an ID depending on depth
      const createdById = extractRelationId(view.createdBy);
      expect(createdById).toBe(regularUser.id);
    });

    it("should update a view", async () => {
      const view = await payload.create({
        collection: "views",
        data: { name: "Original Name", slug: "original-slug", site: testSite.id, isPublic: true, _status: "published" },
        user: regularUser,
      });

      const updated = await payload.update({
        collection: "views",
        id: view.id,
        data: { name: "Updated Name" },
        user: regularUser,
      });

      expect(updated.name).toBe("Updated Name");
    });

    it("should delete a view", async () => {
      const view = await payload.create({
        collection: "views",
        data: { name: "To Delete", slug: "to-delete", site: testSite.id, isPublic: true, _status: "published" },
        user: regularUser,
      });

      await payload.delete({ collection: "views", id: view.id, user: regularUser });

      const found = await payload.find({ collection: "views", where: { id: { equals: view.id } } });

      expect(found.docs).toHaveLength(0);
    });
  });

  describe("Access Control", () => {
    it("should allow anyone to read public views", async () => {
      await payload.create({
        collection: "views",
        data: { name: "Public View", slug: "public-view", site: testSite.id, isPublic: true, _status: "published" },
        user: regularUser,
      });

      // Read as anonymous (no user)
      const result = await payload.find({
        collection: "views",
        where: { slug: { equals: "public-view" } },
        overrideAccess: false,
      });

      expect(result.docs).toHaveLength(1);
    });

    it("should hide private views from other users", async () => {
      await payload.create({
        collection: "views",
        data: { name: "Private View", slug: "private-view", site: testSite.id, isPublic: false, _status: "published" },
        user: regularUser,
      });

      // Read as other user
      const result = await payload.find({
        collection: "views",
        where: { slug: { equals: "private-view" } },
        overrideAccess: false,
        user: otherUser,
      });

      expect(result.docs).toHaveLength(0);
    });

    it("should allow creator to read their own private views", async () => {
      await payload.create({
        collection: "views",
        data: {
          name: "My Private View",
          slug: "my-private-view",
          site: testSite.id,
          isPublic: false,
          _status: "published",
        },
        user: regularUser,
      });

      const result = await payload.find({
        collection: "views",
        where: { slug: { equals: "my-private-view" } },
        overrideAccess: false,
        user: regularUser,
      });

      expect(result.docs).toHaveLength(1);
    });

    it("should allow admin to read all views", async () => {
      await payload.create({
        collection: "views",
        data: {
          name: "Private View",
          slug: "admin-test-private",
          site: testSite.id,
          isPublic: false,
          _status: "published",
        },
        user: regularUser,
      });

      const result = await payload.find({
        collection: "views",
        where: { slug: { equals: "admin-test-private" } },
        overrideAccess: false,
        user: adminUser,
      });

      expect(result.docs).toHaveLength(1);
    });

    it("should prevent other users from updating views", async () => {
      const view = await payload.create({
        collection: "views",
        data: {
          name: "Protected View",
          slug: "protected-view",
          site: testSite.id,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      // Attempt to update as other user should fail
      await expect(
        payload.update({
          collection: "views",
          id: view.id,
          data: { name: "Hacked" },
          overrideAccess: false,
          user: otherUser,
        })
      ).rejects.toThrow();
    });
  });

  describe("Single Default Enforcement (site-scoped)", () => {
    it("should unset other defaults within the same site", async () => {
      const view1 = await payload.create({
        collection: "views",
        data: {
          name: "First Default",
          slug: "first-default",
          site: testSite.id,
          isDefault: true,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      expect(view1.isDefault).toBe(true);

      // Create second default view in the same site
      const view2 = await payload.create({
        collection: "views",
        data: {
          name: "Second Default",
          slug: "second-default",
          site: testSite.id,
          isDefault: true,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      expect(view2.isDefault).toBe(true);

      // First view should no longer be default
      const updatedView1 = await payload.findByID({ collection: "views", id: view1.id });

      expect(updatedView1.isDefault).toBe(false);
    });

    it("should allow defaults in different sites", async () => {
      const otherSite = await payload.create({
        collection: "sites",
        data: { name: "Other Site", slug: "other-site", isPublic: true, _status: "published" },
        user: regularUser,
      });

      const view1 = await payload.create({
        collection: "views",
        data: {
          name: "Default in Site 1",
          slug: "default-site-1",
          site: testSite.id,
          isDefault: true,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      const view2 = await payload.create({
        collection: "views",
        data: {
          name: "Default in Site 2",
          slug: "default-site-2",
          site: otherSite.id,
          isDefault: true,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      // Both should remain default since they're in different sites
      const updatedView1 = await payload.findByID({ collection: "views", id: view1.id });
      const updatedView2 = await payload.findByID({ collection: "views", id: view2.id });

      expect(updatedView1.isDefault).toBe(true);
      expect(updatedView2.isDefault).toBe(true);
    });
  });

  describe("View Resolver", () => {
    let testView: View;

    beforeEach(async () => {
      testView = await payload.create({
        collection: "views",
        data: {
          name: "Resolver Test View",
          slug: "resolver-test",
          site: testSite.id,
          isDefault: false,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });
    });

    it("should find view by slug within a site", async () => {
      const view = await findViewBySlug(payload, "resolver-test", testSite.id);
      expect(view).not.toBeNull();
      expect(view?.id).toBe(testView.id);
    });

    it("should find default view within a site", async () => {
      // Set view as default
      await payload.update({ collection: "views", id: testView.id, data: { isDefault: true } });
      clearViewCache();

      const view = await findDefaultView(payload, testSite.id);
      expect(view).not.toBeNull();
      expect(view?.id).toBe(testView.id);
    });

    it("should resolve view by slug", async () => {
      const view = await resolveView(payload, testSite.id, "resolver-test");
      expect(view?.id).toBe(testView.id);
    });

    it("should resolve default view when no slug", async () => {
      await payload.update({ collection: "views", id: testView.id, data: { isDefault: true } });
      clearViewCache();

      const view = await resolveView(payload, testSite.id);
      expect(view?.id).toBe(testView.id);
    });
  });
});
