// @vitest-environment node
/**
 * Integration tests for the Views collection.
 *
 * Tests CRUD operations, access control, single default enforcement,
 * and view resolution by domain, slug, and default.
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  clearViewCache,
  extractViewSlugFromPath,
  findDefaultView,
  findViewByDomain,
  findViewBySlug,
  getViewDataScopeFilter,
  resolveView,
} from "@/lib/services/view-resolver";
import type { User, View } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Views Collection", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;

  // Test users
  let adminUser: User;
  let regularUser: User;
  let otherUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate();
    clearViewCache();

    // Create test users after truncation
    const { users } = await withUsers(testEnv, {
      admin: { role: "admin" },
      regular: { role: "user" },
      other: { role: "user", email: "other@test.com" },
    });
    adminUser = users.admin;
    regularUser = users.regular;
    otherUser = users.other;
  });

  describe("CRUD Operations", () => {
    it("should create a view with all fields", async () => {
      const view = await payload.create({
        collection: "views",
        data: {
          name: "Test View",
          slug: "test-view",
          isDefault: false,
          isPublic: true,
          _status: "published",
          dataScope: {
            mode: "all",
          },
          filterConfig: {
            mode: "auto",
            maxFilters: 5,
          },
          branding: {
            domain: "test.example.com",
            title: "Test Portal",
            colors: {
              primary: "#3b82f6",
              secondary: "#1e40af",
              background: "#ffffff",
            },
          },
          mapSettings: {
            defaultZoom: 10,
            defaultCenter: {
              latitude: 40.7128,
              longitude: -74.006,
            },
            baseMapStyle: "light",
          },
        },
        user: regularUser,
      });

      expect(view.id).toBeDefined();
      expect(view.name).toBe("Test View");
      expect(view.slug).toBe("test-view");
      expect(view.branding?.domain).toBe("test.example.com");
      expect(view.mapSettings?.defaultZoom).toBe(10);
      // createdBy can be populated (object) or just an ID depending on depth
      const createdById = typeof view.createdBy === "object" ? view.createdBy?.id : view.createdBy;
      expect(createdById).toBe(regularUser.id);
    });

    it("should update a view", async () => {
      const view = await payload.create({
        collection: "views",
        data: {
          name: "Original Name",
          slug: "original-slug",
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      const updated = await payload.update({
        collection: "views",
        id: view.id,
        data: {
          name: "Updated Name",
          branding: {
            title: "Updated Title",
          },
        },
        user: regularUser,
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.branding?.title).toBe("Updated Title");
    });

    it("should delete a view", async () => {
      const view = await payload.create({
        collection: "views",
        data: {
          name: "To Delete",
          slug: "to-delete",
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      await payload.delete({
        collection: "views",
        id: view.id,
        user: regularUser,
      });

      const found = await payload.find({
        collection: "views",
        where: { id: { equals: view.id } },
      });

      expect(found.docs.length).toBe(0);
    });
  });

  describe("Access Control", () => {
    it("should allow anyone to read public views", async () => {
      await payload.create({
        collection: "views",
        data: {
          name: "Public View",
          slug: "public-view",
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      // Read as anonymous (no user)
      const result = await payload.find({
        collection: "views",
        where: { slug: { equals: "public-view" } },
        overrideAccess: false,
      });

      expect(result.docs.length).toBe(1);
    });

    it("should hide private views from other users", async () => {
      await payload.create({
        collection: "views",
        data: {
          name: "Private View",
          slug: "private-view",
          isPublic: false,
          _status: "published",
        },
        user: regularUser,
      });

      // Read as other user
      const result = await payload.find({
        collection: "views",
        where: { slug: { equals: "private-view" } },
        overrideAccess: false,
        user: otherUser,
      });

      expect(result.docs.length).toBe(0);
    });

    it("should allow creator to read their own private views", async () => {
      await payload.create({
        collection: "views",
        data: {
          name: "My Private View",
          slug: "my-private-view",
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

      expect(result.docs.length).toBe(1);
    });

    it("should allow admin to read all views", async () => {
      await payload.create({
        collection: "views",
        data: {
          name: "Private View",
          slug: "admin-test-private",
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

      expect(result.docs.length).toBe(1);
    });

    it("should prevent other users from updating views", async () => {
      const view = await payload.create({
        collection: "views",
        data: {
          name: "Protected View",
          slug: "protected-view",
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

  describe("Single Default Enforcement", () => {
    it("should unset other defaults when setting a new default", async () => {
      // Create first default view
      const view1 = await payload.create({
        collection: "views",
        data: {
          name: "First Default",
          slug: "first-default",
          isDefault: true,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      expect(view1.isDefault).toBe(true);

      // Create second default view
      const view2 = await payload.create({
        collection: "views",
        data: {
          name: "Second Default",
          slug: "second-default",
          isDefault: true,
          isPublic: true,
          _status: "published",
        },
        user: regularUser,
      });

      expect(view2.isDefault).toBe(true);

      // First view should no longer be default
      const updatedView1 = await payload.findByID({
        collection: "views",
        id: view1.id,
      });

      expect(updatedView1.isDefault).toBe(false);
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
          isDefault: false,
          isPublic: true,
          _status: "published",
          branding: {
            domain: "resolver.example.com",
          },
        },
        user: regularUser,
      });
    });

    it("should find view by domain", async () => {
      const view = await findViewByDomain(payload, "resolver.example.com");
      expect(view).not.toBeNull();
      expect(view?.id).toBe(testView.id);
    });

    it("should find view by slug", async () => {
      const view = await findViewBySlug(payload, "resolver-test");
      expect(view).not.toBeNull();
      expect(view?.id).toBe(testView.id);
    });

    it("should find default view", async () => {
      // Set view as default
      await payload.update({
        collection: "views",
        id: testView.id,
        data: { isDefault: true },
      });
      clearViewCache();

      const view = await findDefaultView(payload);
      expect(view).not.toBeNull();
      expect(view?.id).toBe(testView.id);
    });

    it("should resolve view by domain priority", async () => {
      const view = await resolveView(payload, {
        host: "resolver.example.com",
        pathname: "/explore",
      });
      expect(view?.id).toBe(testView.id);
    });

    it("should resolve view by slug from path", async () => {
      const view = await resolveView(payload, {
        host: "localhost:3000",
        pathname: "/v/resolver-test/explore",
      });
      expect(view?.id).toBe(testView.id);
    });

    it("should extract slug from path correctly", () => {
      expect(extractViewSlugFromPath("/v/my-view")).toBe("my-view");
      expect(extractViewSlugFromPath("/v/my-view/explore")).toBe("my-view");
      expect(extractViewSlugFromPath("/explore")).toBeNull();
      expect(extractViewSlugFromPath("/")).toBeNull();
    });
  });

  describe("Data Scope Filter", () => {
    it("should return empty filter for mode=all", () => {
      const filter = getViewDataScopeFilter({
        dataScope: { mode: "all" },
      } as View);
      expect(filter).toEqual({});
    });

    it("should return catalog IDs for mode=catalogs", () => {
      const filter = getViewDataScopeFilter({
        dataScope: {
          mode: "catalogs",
          catalogs: [{ id: 1 }, { id: 2 }],
        },
      } as unknown as View);
      expect(filter.catalogIds).toEqual([1, 2]);
    });

    it("should return dataset IDs for mode=datasets", () => {
      const filter = getViewDataScopeFilter({
        dataScope: {
          mode: "datasets",
          datasets: [{ id: 10 }, { id: 20 }],
        },
      } as unknown as View);
      expect(filter.datasetIds).toEqual([10, 20]);
    });

    it("should handle null view", () => {
      const filter = getViewDataScopeFilter(null);
      expect(filter).toEqual({});
    });
  });
});
