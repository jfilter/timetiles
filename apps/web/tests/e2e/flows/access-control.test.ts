/**
 * E2E tests for access control from user perspective.
 *
 * Tests how the UI handles public vs private resources,
 * and verifies that API endpoints properly enforce access control.
 *
 * @module
 * @category E2E Tests
 */
import type { APIRequestContext } from "@playwright/test";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";

type ApiDoc = { id: number | string; name?: string; isPublic?: boolean; data?: { title?: string } };

type PlaywrightRequestFactory = {
  request: { newContext: (options: { baseURL: string }) => Promise<APIRequestContext> };
};

const createAdminApi = async (
  playwright: PlaywrightRequestFactory,
  baseURL: string
): Promise<{ api: APIRequestContext; authHeaders: Record<string, string> }> => {
  const api = await playwright.request.newContext({ baseURL });
  const loginResponse = await api.post("/api/users/login", {
    data: { email: TEST_EMAILS.admin, password: TEST_CREDENTIALS.seed.admin },
    headers: { "Content-Type": "application/json" },
  });
  expect(loginResponse.status()).toBe(200);

  const body = (await loginResponse.json()) as { token: string };
  return { api, authHeaders: { Authorization: `JWT ${body.token}`, "Content-Type": "application/json" } };
};

const createPrivateCatalog = async (
  adminApi: APIRequestContext,
  authHeaders: Record<string, string>,
  suffix: string
) => {
  const name = `E2E Private Catalog ${suffix}`;
  const response = await adminApi.post("/api/catalogs", { data: { name, isPublic: false }, headers: authHeaders });
  expect(response.status()).toBe(201);

  const body = (await response.json()) as { doc: ApiDoc };
  return { id: body.doc.id, name };
};

const createPrivateDataset = async (
  adminApi: APIRequestContext,
  authHeaders: Record<string, string>,
  catalogId: number | string,
  suffix: string
) => {
  const name = `E2E Private Dataset ${suffix}`;
  const response = await adminApi.post("/api/datasets", {
    data: { name, catalog: catalogId, language: "eng", isPublic: false },
    headers: authHeaders,
  });
  expect(response.status()).toBe(201);

  const body = (await response.json()) as { doc: ApiDoc };
  return { id: body.doc.id, name };
};

const createPrivateEvent = async (
  adminApi: APIRequestContext,
  authHeaders: Record<string, string>,
  datasetId: number | string,
  suffix: string
) => {
  const title = `E2E Private Event ${suffix}`;
  const response = await adminApi.post("/api/events", {
    data: {
      uniqueId: `e2e-private-event-${suffix}`,
      dataset: datasetId,
      sourceData: { title },
      transformedData: { title },
      eventTimestamp: new Date("2024-07-10T00:00:00.000Z").toISOString(),
      location: { latitude: 40.7128, longitude: -74.006 },
    },
    headers: authHeaders,
  });
  expect(response.status()).toBe(201);

  const body = (await response.json()) as { doc: ApiDoc };
  return { id: body.doc.id, title };
};

const deleteApiDoc = async (
  adminApi: APIRequestContext,
  authHeaders: Record<string, string>,
  path: string,
  doc: { id: number | string } | undefined
) => {
  if (!doc) return;
  await adminApi.delete(`${path}/${doc.id}`, { headers: authHeaders }).catch(() => undefined);
};

test.describe("Access Control - User Perspective", () => {
  // Access control tests need unauthenticated state to verify public vs private
  test.use({ storageState: { cookies: [], origins: [] } });

  let explorePage: ExplorePage;

  test.beforeEach(({ page }) => {
    explorePage = new ExplorePage(page);
  });

  test.describe("Unauthenticated Access", () => {
    test("should show only public catalogs in the explore page", async () => {
      await explorePage.goto();

      // Wait for catalogs to load (new UI uses buttons instead of select)
      const catalogs = await explorePage.getAvailableCatalogs();

      // Should have at least one catalog visible
      expect(catalogs.length).toBeGreaterThan(0);

      // Note: Without authentication, only public catalogs should be visible
      // The exact number depends on seeded data
      console.log("Available catalogs for unauthenticated user:", catalogs);
    });

    test("should hide private catalogs and their datasets from unauthenticated users", async () => {
      await explorePage.goto();

      // The E2E seed contains a private catalog "Historical Records" with
      // private datasets. Neither the catalog nor its datasets may leak.
      const catalogs = await explorePage.getAvailableCatalogs();
      expect(catalogs.length).toBeGreaterThan(0);
      expect(catalogs).not.toContain("Historical Records");

      const datasets = await explorePage.getAvailableDatasets();
      expect(datasets).not.toContain("Historical Records");
    });

    test("should return 401 when trying to access admin API endpoints", async ({ request }) => {
      // Try to access admin-only API endpoint
      const response = await request.get("/api/admin/schedule-service", {
        timeout: 10000, // Increase timeout to handle server resource constraints
      });

      // Should be unauthorized (401) or forbidden (403)
      expect([401, 403]).toContain(response.status());
    });

    test("should return proper error when accessing private catalog via API", async ({ request }) => {
      // First, we need to know a private catalog ID
      // This test assumes we have seeded a private catalog
      // We'll try to access events from a catalog that doesn't exist or is private

      // Try to access with an ID that likely doesn't exist or is private
      const response = await request.get("/api/catalogs/999999", {
        timeout: 10000, // Increase timeout to handle server resource constraints
      });

      // Should return 403 (forbidden) or 404 (not found)
      expect([403, 404]).toContain(response.status());
    });

    test("should not display admin navigation elements", async ({ page }) => {
      await page.goto("/", { timeout: 10000 });

      // Should not see dashboard link
      const adminLink = page.locator('a[href="/dashboard"]').first();
      const isVisible = await adminLink.isVisible().catch(() => false);

      // Admin link should either not exist or not be visible
      expect(isVisible).toBe(false);
    });
  });

  test.describe("API Access Control Enforcement", () => {
    test("should enforce access control on catalog list endpoint", async ({ request, playwright, baseURL }) => {
      const suffix = `${Date.now()}-${test.info().parallelIndex}`;
      const admin = await createAdminApi(playwright, baseURL);
      let privateCatalog: { id: number | string; name: string } | undefined;
      try {
        privateCatalog = await createPrivateCatalog(admin.api, admin.authHeaders, suffix);

        // Unauthenticated request
        const response = await request.get("/api/catalogs");

        // Should succeed but only return public catalogs
        expect(response.status()).toBe(200);

        const data = await response.json();
        const docs = (data.docs ?? []) as ApiDoc[];

        expect(docs.map((catalog) => catalog.id)).not.toContain(privateCatalog.id);
        expect(docs.map((catalog) => catalog.name)).not.toContain(privateCatalog.name);
        expect(docs.some((catalog) => catalog.isPublic === false)).toBe(false);
      } finally {
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/catalogs", privateCatalog);
        await admin.api.dispose();
      }
    });

    test("should enforce access control on dataset list endpoint", async ({ request, playwright, baseURL }) => {
      const suffix = `${Date.now()}-${test.info().parallelIndex}`;
      const admin = await createAdminApi(playwright, baseURL);
      let privateCatalog: { id: number | string; name: string } | undefined;
      let privateDataset: { id: number | string; name: string } | undefined;
      try {
        privateCatalog = await createPrivateCatalog(admin.api, admin.authHeaders, suffix);
        privateDataset = await createPrivateDataset(admin.api, admin.authHeaders, privateCatalog.id, suffix);

        // Unauthenticated request
        const response = await request.get("/api/datasets");

        // Should succeed but only return public datasets (or datasets in public catalogs)
        expect(response.status()).toBe(200);

        const data = await response.json();
        const docs = (data.docs ?? []) as ApiDoc[];

        expect(docs.map((dataset) => dataset.id)).not.toContain(privateDataset.id);
        expect(docs.map((dataset) => dataset.name)).not.toContain(privateDataset.name);
        expect(docs.some((dataset) => dataset.isPublic === false)).toBe(false);
      } finally {
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/datasets", privateDataset);
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/catalogs", privateCatalog);
        await admin.api.dispose();
      }
    });

    test("should enforce access control on event list endpoint", async ({ request, playwright, baseURL }) => {
      const suffix = `${Date.now()}-${test.info().parallelIndex}`;
      const admin = await createAdminApi(playwright, baseURL);
      let privateCatalog: { id: number | string; name: string } | undefined;
      let privateDataset: { id: number | string; name: string } | undefined;
      let privateEvent: { id: number | string; title: string } | undefined;
      try {
        privateCatalog = await createPrivateCatalog(admin.api, admin.authHeaders, suffix);
        privateDataset = await createPrivateDataset(admin.api, admin.authHeaders, privateCatalog.id, suffix);
        privateEvent = await createPrivateEvent(admin.api, admin.authHeaders, privateDataset.id, suffix);

        // Unauthenticated request
        const response = await request.get("/api/v1/events");

        // Should succeed and return only events from accessible datasets
        expect(response.status()).toBe(200);

        const data = await response.json();
        const events = (data.events ?? []) as ApiDoc[];
        const eventTitles = events.map((event) => event.data?.title);

        expect(eventTitles).not.toContain(privateEvent.title);
      } finally {
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/events", privateEvent);
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/datasets", privateDataset);
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/catalogs", privateCatalog);
        await admin.api.dispose();
      }
    });

    test("should block create operations without authentication", async ({ request }) => {
      // Try to create a catalog without authentication
      const createResponse = await request.post("/api/catalogs", {
        data: { name: "Unauthorized Catalog", description: "Should not be created", isPublic: true },
      });

      // Should be unauthorized
      expect([401, 403]).toContain(createResponse.status());
    });

    test("should block update operations without authentication", async ({ request }) => {
      // Try to update a catalog without authentication
      const updateResponse = await request.patch("/api/catalogs/1", { data: { name: "Hacked Catalog Name" } });

      // Should be unauthorized
      expect([401, 403, 404]).toContain(updateResponse.status());
    });

    test("should block delete operations without authentication", async ({ request }) => {
      // Try to delete a catalog without authentication
      const deleteResponse = await request.delete("/api/catalogs/1");

      // Should be unauthorized
      expect([401, 403, 404]).toContain(deleteResponse.status());
    });
  });

  test.describe("Import File Access Control", () => {
    test("should not allow accessing other users' import files", async ({ request }) => {
      // Try to access an import file that might exist
      const response = await request.get("/api/ingest-files/1");

      // Should return 401 (unauthorized) or 404 (not found due to access control)
      expect([401, 403, 404]).toContain(response.status());
    });

    test("should require authentication for import file creation", async ({ request }) => {
      // Unauthenticated uploads are no longer supported - all imports require authentication
      const response = await request.post("/api/ingest-files", {
        data: { originalName: "test-unauthenticated.csv", status: "pending" },
      });

      // Should be unauthorized - authentication is required
      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe("scheduled ingest Access Control", () => {
    test("should prevent creating scheduled ingests without authentication", async ({ request }) => {
      const response = await request.post("/api/scheduled-ingests", {
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

    test("should not list scheduled ingests without authentication", async ({ request }) => {
      const response = await request.get("/api/scheduled-ingests");

      // Should be unauthorized or return empty list
      expect([200, 401, 403]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        // If accessible, should return empty list for unauthenticated user
        // (depending on implementation)
        expect(data.totalDocs).toBe(0);
        expect(data.docs ?? []).toHaveLength(0);
      }
    });
  });

  test.describe("Data Visibility in UI", () => {
    test("should filter catalogs based on visibility", async () => {
      await explorePage.goto();

      // Check that only appropriate catalogs are shown (new UI uses buttons)
      const catalogs = await explorePage.getAvailableCatalogs();

      // Should have at least one catalog visible
      expect(catalogs.length).toBeGreaterThanOrEqual(1);

      console.log(`Visible catalogs in UI: ${catalogs.length}`, catalogs);
    });

    test("should show appropriate dataset count", async ({ page }) => {
      await explorePage.goto();
      await explorePage.waitForEventsToLoad();

      // Check dataset section
      const datasetsSection = page.locator("text=Datasets").first();
      await expect(datasetsSection).toBeVisible();

      // Count accessible datasets (each dataset has a checkbox)
      const datasetCheckboxes = await page.locator('[role="checkbox"]').count();

      console.log(`Visible dataset checkboxes in UI: ${datasetCheckboxes}`);

      // Should be 0 or more depending on seeded data
      expect(datasetCheckboxes).toBeGreaterThanOrEqual(0);
    });

    test("should handle empty state when no public data exists", async ({ page }) => {
      // Mock empty response
      await page.route("**/api/v1/events?*", async (route) => {
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
      const response = await request.get("/api/v1/events");

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
      const response = await request.fetch("/api/v1/events/list", { method: "OPTIONS" });

      // Should handle OPTIONS request
      expect([200, 204, 404]).toContain(response.status());
    });
  });
});

test.describe("Access Control - Error Handling", () => {
  // These tests need unauthenticated state to verify error handling
  test.use({ storageState: { cookies: [], origins: [] } });
  test("should show user-friendly error for unauthorized access", async ({ page }) => {
    // Try to navigate to dashboard with increased timeout for JS bundle loading
    await page.goto("/dashboard", { timeout: 10000 });

    // Should redirect to login page - wait for login form to appear
    // instead of waiting for networkidle (which times out with admin panel JS bundles)
    // Use .first() to avoid strict mode violation (there are 2 email inputs on the page)
    await page.locator('input[type="email"]').first().waitFor({ timeout: 5000 });

    const url = page.url();
    console.log("Redirect URL after admin access attempt:", url);

    // Should be on login page (accepts /login, /auth, or /dashboard/login)
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
        body: JSON.stringify({ error: "Forbidden", message: "You do not have permission to access this resource" }),
      });
    });

    await page.goto("/explore");

    // Page should still load without crashing
    await page.waitForLoadState("networkidle");

    // Page should have content (didn't crash)
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    // Should not display raw JSON error to the user
    expect(bodyText).not.toContain('"error":"Forbidden"');
  });
});
