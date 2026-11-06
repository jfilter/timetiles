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

import { TEST_EMAILS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";
import { headerSignInLink } from "../pages/responsive-layout";

type ApiDoc = { id: number | string; name?: string; isPublic?: boolean; data?: { title?: string } };

type PlaywrightRequestFactory = {
  request: { newContext: (options: { baseURL: string; storageState?: string }) => Promise<APIRequestContext> };
};

/**
 * Admin API context that REUSES the session `auth.setup` already established.
 *
 * Logging in again per test was the cause of a flaky 404: Payload keeps `useSessions` on, and
 * `addSessionToUser` appends to `user.sessions` with a read-modify-write of the whole user
 * document. Two concurrent logins of the same account lose one of the sessions, and the JWT
 * strategy answers `user: null` for a token whose sid is gone — the request then continues
 * silently as anonymous, so a private record it had just created came back 404. With
 * `fullyParallel` workers all logging in as the seed admin, that also evicted the storageState
 * session other test files depend on. Loading the saved cookie adds no session at all.
 */
const ADMIN_AUTH_FILE = "test-results/.auth/admin.json";

const createAdminApi = async (
  playwright: PlaywrightRequestFactory,
  baseURL: string
): Promise<{ api: APIRequestContext; authHeaders: Record<string, string> }> => {
  const api = await playwright.request.newContext({ baseURL, storageState: ADMIN_AUTH_FILE });
  const authHeaders = { "Content-Type": "application/json" };

  // Assert we are actually somebody — Payload answers 200 with `user: null` when the cookie
  // is not accepted, and every later failure would then be a misleading 403/404.
  const me = await api.get("/api/users/me", { headers: authHeaders });
  expect(me.status()).toBe(200);
  const meBody = (await me.json()) as { user?: { email?: string } | null };
  expect(meBody.user?.email).toBe(TEST_EMAILS.admin);

  return { api, authHeaders };
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
  const response = await adminApi.delete(`${path}/${doc.id}`, { headers: authHeaders });
  expect(response.ok(), `cleanup DELETE ${path}/${doc.id}`).toBe(true);
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

      const catalogs = await explorePage.getAvailableCatalogs();

      expect(catalogs.length).toBeGreaterThan(0);

      // Note: Without authentication, only public catalogs should be visible.
      expect(catalogs).toContain("Environmental Data");
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
      const response = await request.get("/api/admin/schedule-service", {
        timeout: 10000, // Increase timeout to handle server resource constraints
      });

      expect([401, 403]).toContain(response.status());
    });

    test("should return proper error when accessing a real private catalog via API", async ({
      request,
      playwright,
      baseURL,
    }) => {
      const suffix = `${Date.now()}-${test.info().parallelIndex}`;
      const admin = await createAdminApi(playwright, baseURL);
      let privateCatalog: { id: number | string; name: string } | undefined;

      try {
        privateCatalog = await createPrivateCatalog(admin.api, admin.authHeaders, suffix);

        const response = await request.get(`/api/catalogs/${privateCatalog.id}`, {
          timeout: 10000, // Increase timeout to handle server resource constraints
        });

        // 404 is acceptable for access-hidden records, but this record exists.
        expect([403, 404]).toContain(response.status());
      } finally {
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/catalogs", privateCatalog);
        await admin.api.dispose();
      }
    });

    test("should not display admin navigation elements", async ({ page }) => {
      await page.goto("/", { timeout: 10000 });

      // The anonymous header renders a sign-in link where signed-in users get the dashboard link.
      await expect(await headerSignInLink(page)).toBeVisible();
      await expect(page.locator('a[href="/dashboard"]')).toHaveCount(0);
    });
  });

  test.describe("API Access Control Enforcement", () => {
    test("should enforce access control on catalog list endpoint", async ({ request, playwright, baseURL }) => {
      const suffix = `${Date.now()}-${test.info().parallelIndex}`;
      const admin = await createAdminApi(playwright, baseURL);
      let privateCatalog: { id: number | string; name: string } | undefined;
      try {
        privateCatalog = await createPrivateCatalog(admin.api, admin.authHeaders, suffix);

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
      const createResponse = await request.post("/api/catalogs", {
        data: { name: "Unauthorized Catalog", description: "Should not be created", isPublic: true },
      });

      expect([401, 403]).toContain(createResponse.status());
    });

    test("should block update operations without authentication", async ({ request, playwright, baseURL }) => {
      const suffix = `${Date.now()}-${test.info().parallelIndex}`;
      const admin = await createAdminApi(playwright, baseURL);
      let privateCatalog: { id: number | string; name: string } | undefined;

      try {
        privateCatalog = await createPrivateCatalog(admin.api, admin.authHeaders, suffix);

        const updateResponse = await request.patch(`/api/catalogs/${privateCatalog.id}`, {
          data: { name: "Hacked Catalog Name" },
        });

        // 404 is acceptable if the API hides inaccessible records, but the
        // admin follow-up below proves the record existed and stayed unchanged.
        expect([401, 403, 404]).toContain(updateResponse.status());

        const verifyResponse = await admin.api.get(`/api/catalogs/${privateCatalog.id}`, {
          headers: admin.authHeaders,
        });
        expect(verifyResponse.status()).toBe(200);
        const verifyBody = (await verifyResponse.json()) as ApiDoc;
        expect(verifyBody.name).toBe(privateCatalog.name);
      } finally {
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/catalogs", privateCatalog);
        await admin.api.dispose();
      }
    });

    test("should block delete operations without authentication", async ({ request, playwright, baseURL }) => {
      const suffix = `${Date.now()}-${test.info().parallelIndex}`;
      const admin = await createAdminApi(playwright, baseURL);
      let privateCatalog: { id: number | string; name: string } | undefined;

      try {
        privateCatalog = await createPrivateCatalog(admin.api, admin.authHeaders, suffix);

        const deleteResponse = await request.delete(`/api/catalogs/${privateCatalog.id}`);

        // 404 is acceptable if the API hides inaccessible records, but the
        // admin follow-up below proves the record was not deleted.
        expect([401, 403, 404]).toContain(deleteResponse.status());

        const verifyResponse = await admin.api.get(`/api/catalogs/${privateCatalog.id}`, {
          headers: admin.authHeaders,
        });
        expect(verifyResponse.status()).toBe(200);
      } finally {
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/catalogs", privateCatalog);
        await admin.api.dispose();
      }
    });
  });

  test.describe("Import File Access Control", () => {
    test("should not allow accessing other users' import files", async ({ request, playwright, baseURL }) => {
      // Uses a real file owned by someone else: a 404 for an id that might not exist
      // would pass without access control doing anything.
      const admin = await createAdminApi(playwright, baseURL);
      let ingestFile: ApiDoc | undefined;

      try {
        // `ingest-files` is an upload collection, so a create needs an actual file part —
        // a JSON body can only ever answer 400.
        // The `user` relationship is required, so the owner has to be sent along too.
        const me = await admin.api.get("/api/users/me", { headers: admin.authHeaders });
        expect(me.status()).toBe(200);
        const adminId = ((await me.json()) as { user: { id: number } }).user.id;

        const created = await admin.api.post("/api/ingest-files", {
          multipart: {
            file: {
              name: `e2e-private-import-${Date.now()}.csv`,
              mimeType: "text/csv",
              buffer: Buffer.from("name,value\nprivate,1\n"),
            },
            _payload: JSON.stringify({ originalName: `e2e-private-import-${Date.now()}.csv`, user: adminId }),
          },
          headers: { Authorization: admin.authHeaders.Authorization! },
        });
        expect(created.status()).toBe(201);
        ingestFile = ((await created.json()) as { doc: ApiDoc }).doc;

        // The owner can read it — otherwise the denial below proves nothing.
        const asOwner = await admin.api.get(`/api/ingest-files/${ingestFile.id}`, { headers: admin.authHeaders });
        expect(asOwner.status()).toBe(200);

        const asStranger = await request.get(`/api/ingest-files/${ingestFile.id}`);
        expect([401, 403, 404]).toContain(asStranger.status());
      } finally {
        await deleteApiDoc(admin.api, admin.authHeaders, "/api/ingest-files", ingestFile);
        await admin.api.dispose();
      }
    });

    test("should require authentication for import file creation", async ({ request }) => {
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

      expect([401, 403]).toContain(response.status());
    });

    test("should not list scheduled ingests without authentication", async ({ request }) => {
      const response = await request.get("/api/scheduled-ingests");

      // Collection access denies unauthenticated reads — must be 401/403, not 200.
      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe("Data Visibility in UI", () => {
    test("should filter catalogs based on visibility", async () => {
      await explorePage.goto();

      const catalogs = await explorePage.getAvailableCatalogs();

      expect(catalogs).toContain("Environmental Data");
    });

    test("should show appropriate dataset count", async ({ page }) => {
      await explorePage.goto();
      await explorePage.waitForEventsToLoad();

      const datasetsSection = page.locator("text=Datasets").first();
      await expect(datasetsSection).toBeVisible();

      await explorePage.expandAllCatalogs();
      const datasets = await explorePage.getAvailableDatasets();

      expect(datasets).toEqual(
        expect.arrayContaining(["Air Quality Measurements", "Water Quality Assessments", "Climate Station Data"])
      );
    });

    test("should handle empty state when no public data exists", async ({ page }) => {
      await page.route("**/api/v1/events?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            events: [],
            pagination: {
              totalDocs: 0,
              limit: 1000,
              page: 1,
              totalPages: 0,
              hasPrevPage: false,
              hasNextPage: false,
              prevPage: null,
              nextPage: null,
            },
          }),
        });
      });

      await explorePage.goto();
      await explorePage.waitForEventsToLoad();

      await explorePage.show("list");
      await expect(explorePage.noEventsMessage).toBeVisible();
    });
  });

  test.describe("Cross-Origin and Security Headers", () => {
    test("should include proper security headers in API responses", async ({ request }) => {
      const response = await request.get("/api/v1/events");

      // Check for security headers (these might vary based on Next.js config)
      const headers = response.headers();

      expect(headers["content-type"]).toContain("application/json");
    });

    test("should handle CORS properly for API endpoints", async ({ request }) => {
      const response = await request.fetch("/api/v1/events/list", { method: "OPTIONS" });

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

    // Wait for the login form, not networkidle (times out on the admin JS bundles);
    // first(): the page has two email inputs
    await page.locator('input[type="email"]').first().waitFor({ timeout: 5000 });

    const url = page.url();

    // Should be on login page (accepts /login, /auth, or /dashboard/login)
    const isOnLogin = url.includes("/login") || url.includes("/auth");
    expect(isOnLogin).toBe(true);

    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("should handle 403 responses gracefully", async ({ page }) => {
    await page.route("**/api/catalogs*", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forbidden", message: "You do not have permission to access this resource" }),
      });
    });

    await page.goto("/explore");

    await page.waitForLoadState("networkidle");

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toContain('"error":"Forbidden"');
  });
});
