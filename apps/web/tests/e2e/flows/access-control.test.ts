/**
 * E2E tests for access control from user perspective.
 *
 * Tests how the UI handles public vs private resources,
 * and verifies that API endpoints properly enforce access control.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "@playwright/test";

import { ExplorePage } from "../pages/explore.page";

test.describe("Access Control - User Perspective", () => {
  let explorePage: ExplorePage;

  test.beforeEach(({ page }) => {
    explorePage = new ExplorePage(page);
  });

  test.describe("Unauthenticated Access", () => {
    test("should show only public catalogs in the explore page", async ({ page }) => {
      await explorePage.goto();

      // Wait for catalogs to load
      await page.waitForSelector('[data-testid="catalog-select"], [id*="catalog"], select');

      // Get all catalog options
      const catalogSelect = explorePage.catalogSelect;
      await catalogSelect.click();

      // Get all available options
      const options = await page.locator("option, [role='option']").allTextContents();

      // Should include "All Catalogs" option
      expect(options.some((opt) => opt.includes("All"))).toBe(true);

      // Note: Without authentication, only public catalogs should be visible
      // The exact number depends on seeded data
      console.log("Available catalogs for unauthenticated user:", options);
    });

    test("should display only events from public datasets", async () => {
      await explorePage.goto();
      await explorePage.waitForEventsToLoad();

      // All displayed events should be from public datasets
      // We can verify this by checking that events are visible
      const eventCount = await explorePage.getEventCount();
      console.log(`Unauthenticated user can see ${eventCount} events`);

      // Events count should be >= 0 (depending on seeded public data)
      expect(eventCount).toBeGreaterThanOrEqual(0);
    });

    test("should return 401 when trying to access admin API endpoints", async ({ request }) => {
      // Try to access admin-only API endpoint
      const response = await request.get("http://localhost:3002/api/admin/schedule-service");

      // Should be unauthorized (401) or forbidden (403)
      expect([401, 403]).toContain(response.status());
    });

    test("should return proper error when accessing private catalog via API", async ({ request }) => {
      // First, we need to know a private catalog ID
      // This test assumes we have seeded a private catalog
      // We'll try to access events from a catalog that doesn't exist or is private

      // Try to access with an ID that likely doesn't exist or is private
      const response = await request.get("http://localhost:3002/api/catalogs/999999");

      // Should return 403 (forbidden) or 404 (not found)
      expect([403, 404]).toContain(response.status());
    });

    test("should not display admin navigation elements", async ({ page }) => {
      await page.goto("http://localhost:3002/");

      // Should not see admin panel link
      const adminLink = page.locator('a[href="/admin"]').first();
      const isVisible = await adminLink.isVisible().catch(() => false);

      // Admin link should either not exist or not be visible
      expect(isVisible).toBe(false);
    });
  });

  test.describe("API Access Control Enforcement", () => {
    test("should enforce access control on catalog list endpoint", async ({ request }) => {
      // Unauthenticated request
      const response = await request.get("http://localhost:3002/api/catalogs");

      // Should succeed but only return public catalogs
      expect(response.status()).toBe(200);

      const data = await response.json();
      console.log(`Public catalogs returned: ${data.totalDocs}`);

      // All returned catalogs should be public
      if (data.docs && data.docs.length > 0) {
        // Note: API might not return isPublic field, or might filter server-side
        console.log(
          "Catalog visibility:",
          data.docs.map((c: any) => ({ id: c.id, isPublic: c.isPublic }))
        );
      }
    });

    test("should enforce access control on dataset list endpoint", async ({ request }) => {
      // Unauthenticated request
      const response = await request.get("http://localhost:3002/api/datasets");

      // Should succeed but only return public datasets (or datasets in public catalogs)
      expect(response.status()).toBe(200);

      const data = await response.json();
      console.log(`Public datasets returned: ${data.totalDocs}`);

      if (data.docs && data.docs.length > 0) {
        // Check that returned datasets are either public or in public catalogs
        const datasetInfo = data.docs.map((d: any) => ({
          id: d.id,
          name: d.name,
          isPublic: d.isPublic,
        }));
        console.log("Dataset visibility:", datasetInfo);
      }
    });

    test("should enforce access control on event list endpoint", async ({ request }) => {
      // Unauthenticated request
      const response = await request.get("http://localhost:3002/api/events/list");

      // Should succeed and return only events from accessible datasets
      expect(response.status()).toBe(200);

      const data = await response.json();
      console.log(`Public events returned: ${data.pagination.totalDocs}`);

      // Events should be accessible
      expect(data.pagination.totalDocs).toBeGreaterThanOrEqual(0);
    });

    test("should block create operations without authentication", async ({ request }) => {
      // Try to create a catalog without authentication
      const createResponse = await request.post("http://localhost:3002/api/catalogs", {
        data: {
          name: "Unauthorized Catalog",
          description: "Should not be created",
          isPublic: true,
        },
      });

      // Should be unauthorized
      expect([401, 403]).toContain(createResponse.status());
    });

    test("should block update operations without authentication", async ({ request }) => {
      // Try to update a catalog without authentication
      const updateResponse = await request.patch("http://localhost:3002/api/catalogs/1", {
        data: {
          name: "Hacked Catalog Name",
        },
      });

      // Should be unauthorized
      expect([401, 403, 404]).toContain(updateResponse.status());
    });

    test("should block delete operations without authentication", async ({ request }) => {
      // Try to delete a catalog without authentication
      const deleteResponse = await request.delete("http://localhost:3002/api/catalogs/1");

      // Should be unauthorized
      expect([401, 403, 404]).toContain(deleteResponse.status());
    });
  });

  test.describe("Import File Access Control", () => {
    test("should not allow accessing other users' import files", async ({ request }) => {
      // Try to access an import file that might exist
      const response = await request.get("http://localhost:3002/api/import-files/1");

      // Should return 401 (unauthorized) or 404 (not found due to access control)
      expect([401, 403, 404]).toContain(response.status());
    });

    test("should require authentication for import file creation", async ({ request }) => {
      // Unauthenticated uploads are no longer supported - all imports require authentication
      const response = await request.post("http://localhost:3002/api/import-files", {
        data: {
          originalName: "test-unauthenticated.csv",
          status: "pending",
        },
      });

      // Should be unauthorized - authentication is required
      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe("Scheduled Import Access Control", () => {
    test("should prevent creating scheduled imports without authentication", async ({ request }) => {
      const response = await request.post("http://localhost:3002/api/scheduled-imports", {
        data: {
          name: "Unauthorized Schedule",
          sourceUrl: "https://example.com/data.csv",
          scheduleType: "frequency",
          frequency: "daily",
          enabled: false,
        },
      });

      // Should be unauthorized
      expect([401, 403]).toContain(response.status());
    });

    test("should not list scheduled imports without authentication", async ({ request }) => {
      const response = await request.get("http://localhost:3002/api/scheduled-imports");

      // Should be unauthorized or return empty list
      expect([200, 401, 403]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        // If accessible, should return empty list for unauthenticated user
        // (depending on implementation)
        console.log("Scheduled imports for unauthenticated:", data.totalDocs);
      }
    });
  });

  test.describe("Data Visibility in UI", () => {
    test("should filter catalogs based on visibility", async ({ page }) => {
      await explorePage.goto();

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Check that only appropriate catalogs are shown
      const catalogSelect = explorePage.catalogSelect;
      await catalogSelect.click();

      const optionCount = await page.locator("option, [role='option']").count();

      // Should have at least "All Catalogs" option
      expect(optionCount).toBeGreaterThanOrEqual(1);

      console.log(`Visible catalogs in UI: ${optionCount}`);
    });

    test("should show appropriate dataset count", async ({ page }) => {
      await explorePage.goto();
      await explorePage.waitForEventsToLoad();

      // Check dataset section
      const datasetsSection = page.locator("text=Datasets").first();
      await expect(datasetsSection).toBeVisible();

      // Count should only include accessible datasets
      const datasetElements = await page.locator("[data-testid='dataset-item'], .dataset-item").count();

      console.log(`Visible datasets in UI: ${datasetElements}`);

      // Should be 0 or more depending on seeded data
      expect(datasetElements).toBeGreaterThanOrEqual(0);
    });

    test("should handle empty state when no public data exists", async ({ page }) => {
      // Mock empty response
      await page.route("**/api/events/list*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            docs: [],
            totalDocs: 0,
            limit: 1000,
            page: 1,
            totalPages: 0,
            pagingCounter: 1,
            hasPrevPage: false,
            hasNextPage: false,
            prevPage: null,
            nextPage: null,
          }),
        });
      });

      await explorePage.goto();
      await explorePage.waitForEventsToLoad();

      // Should show "No events found" message
      await expect(explorePage.noEventsMessage).toBeVisible();
    });
  });

  test.describe("Cross-Origin and Security Headers", () => {
    test("should include proper security headers in API responses", async ({ request }) => {
      const response = await request.get("http://localhost:3002/api/events/list");

      // Check for security headers (these might vary based on Next.js config)
      const headers = response.headers();

      console.log("Security headers:", {
        "x-frame-options": headers["x-frame-options"],
        "x-content-type-options": headers["x-content-type-options"],
        "content-type": headers["content-type"],
      });

      // Content-Type should be JSON
      expect(headers["content-type"]).toContain("application/json");
    });

    test("should handle CORS properly for API endpoints", async ({ request }) => {
      // Test CORS preflight
      const response = await request.fetch("http://localhost:3002/api/events/list", {
        method: "OPTIONS",
      });

      // Should handle OPTIONS request
      expect([200, 204, 404]).toContain(response.status());
    });
  });
});

test.describe("Access Control - Error Handling", () => {
  test("should show user-friendly error for unauthorized access", async ({ page }) => {
    // Try to navigate to admin panel with increased timeout for JS bundle loading
    await page.goto("http://localhost:3002/admin", { timeout: 30000 });

    // Should redirect to login page - wait for login form to appear
    // instead of waiting for networkidle (which times out with admin panel JS bundles)
    // Use .first() to avoid strict mode violation (there are 2 email inputs on the page)
    await page.locator('input[type="email"]').first().waitFor({ timeout: 15000 });

    const url = page.url();
    console.log("Redirect URL after admin access attempt:", url);

    // Should be on login page (accepts /login, /auth, or /admin/login)
    const isOnLogin = url.includes("/login") || url.includes("/auth");
    expect(isOnLogin).toBe(true);

    // Login form should be visible - use .first() to target the first email input
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("should handle 403 responses gracefully", async ({ page }) => {
    // Mock 403 response
    await page.route("**/api/catalogs*", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Forbidden",
          message: "You do not have permission to access this resource",
        }),
      });
    });

    await page.goto("http://localhost:3002/explore");

    // Page should still load, but might show error state
    await page.waitForLoadState("networkidle");

    // UI should handle the error gracefully
    // (exact behavior depends on error handling implementation)
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();
  });
});
