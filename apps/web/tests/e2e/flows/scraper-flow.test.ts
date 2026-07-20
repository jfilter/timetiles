/**
 * E2E API tests for the scraper flow.
 *
 * Tests the full scraper lifecycle via REST API:
 * 1. Enable scrapers feature flag
 * 2. Create a scraper-repo with inline code and manifest
 * 3. Verify the auto-triggered sync job creates scrapers from the manifest
 * 4. Trigger a manual scraper run
 * 5. Clean up the scraper-repo
 *
 * This is an API-only test — no scraper runner is available in CI, so the
 * actual scraper execution is not verified. We only confirm the API layer
 * accepts requests and creates the expected records.
 *
 * @module
 * @category E2E Tests
 */
import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";

test.describe("Scraper Flow - API", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  // Shared state across serial tests
  let token: string;
  let repoId: number;
  let scraperId: number;
  let baseUrl: string;

  test("should login as admin", async ({ request, baseURL }) => {
    baseUrl = baseURL;

    const loginResponse = await request.post(`${baseURL}/api/users/login`, {
      data: { email: TEST_EMAILS.admin, password: TEST_CREDENTIALS.seed.admin },
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    expect(loginResponse.status()).toBe(200);

    const body = await loginResponse.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.user).toBeDefined();
    expect(body.user.role).toBe("admin");

    token = body.token;
  });

  test("should enable scrapers feature flag via Settings global", async ({ request }) => {
    // First, read current settings to avoid overwriting other fields
    const getResponse = await request.get(`${baseUrl}/api/globals/settings`, {
      headers: { Authorization: `JWT ${token}` },
      timeout: 10000,
    });

    expect(getResponse.status()).toBe(200);
    const currentSettings = await getResponse.json();

    // Update only the enableScrapers flag
    const updateResponse = await request.post(`${baseUrl}/api/globals/settings`, {
      headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
      data: { ...currentSettings, featureFlags: { ...currentSettings.featureFlags, enableScrapers: true } },
      timeout: 10000,
    });

    expect(updateResponse.status()).toBe(200);

    const updateBody = await updateResponse.json();
    // Payload REST API wraps global update response in { result: <doc>, message: "..." }
    const updatedSettings = updateBody.result ?? updateBody;
    expect(updatedSettings.featureFlags.enableScrapers).toBe(true);
  });

  test("should create a scraper-repo with upload source type and inline code", async ({ request }) => {
    const inlineCode = {
      "scrapers.yml": [
        "scrapers:",
        "  - name: Test Scraper",
        "    slug: test-scraper",
        "    runtime: python",
        "    entrypoint: scraper.py",
        "    output: data.csv",
      ].join("\n"),
      "scraper.py": [
        "import csv",
        "with open('/output/data.csv', 'w') as f:",
        "    writer = csv.writer(f)",
        "    writer.writerow(['title', 'date'])",
        "    writer.writerow(['Test Event', '2026-01-01'])",
      ].join("\n"),
    };

    // The feature flag service has a 1-minute in-memory cache. Retry until
    // the server-side cache expires and the flag takes effect.
    let createResponse!: Awaited<ReturnType<typeof request.post>>;
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      createResponse = await request.post(`${baseUrl}/api/scraper-repos`, {
        headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
        data: { name: `E2E Test Scraper Repo ${Date.now()}`, sourceType: "upload", code: inlineCode },
        timeout: 10000,
      });
      if (createResponse.status() === 201) break;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    expect(createResponse.status()).toBe(201);

    const body = await createResponse.json();
    expect(body.doc).toBeDefined();
    expect(typeof body.doc.id).toBe("number");
    expect(body.doc.sourceType).toBe("upload");

    repoId = body.doc.id;
  });

  test("should auto-sync and create scrapers from manifest", async ({ request }) => {
    // The afterChange hook on scraper-repos queues a scraper-repo-sync job.
    // We need to wait for the job to complete. Poll the repo's lastSyncStatus.
    const maxAttempts = 30;
    const pollIntervalMs = 2000;
    let syncStatus: string | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const repoResponse = await request.get(`${baseUrl}/api/scraper-repos/${repoId}`, {
        headers: { Authorization: `JWT ${token}` },
        timeout: 10000,
      });

      expect(repoResponse.status()).toBe(200);

      const repoData = await repoResponse.json();
      syncStatus = repoData.lastSyncStatus;

      if (syncStatus === "success" || syncStatus === "failed") {
        if (syncStatus === "failed") {
          console.log("Sync failed with error:", repoData.lastSyncError);
        }
        break;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    expect(syncStatus).toBe("success");

    // Verify scrapers were created from the manifest
    const scrapersResponse = await request.get(`${baseUrl}/api/scrapers?where[repo][equals]=${repoId}`, {
      headers: { Authorization: `JWT ${token}` },
      timeout: 10000,
    });

    expect(scrapersResponse.status()).toBe(200);

    const scrapersData = await scrapersResponse.json();
    expect(scrapersData.totalDocs).toBe(1);
    expect(scrapersData.docs).toHaveLength(1);

    const scraper = scrapersData.docs[0];
    expect(scraper.name).toBe("Test Scraper");
    expect(scraper.slug).toBe("test-scraper");
    expect(scraper.runtime).toBe("python");
    expect(scraper.entrypoint).toBe("scraper.py");
    expect(scraper.outputFile).toBe("data.csv");
    expect(scraper.enabled).toBe(true);

    scraperId = scraper.id;
  });

  // The 409 case runs before the successful trigger, and both set their own
  // precondition. Neither is negotiable:
  //
  // - Deriving "running" from a preceding trigger raced the job worker. With no
  //   SCRAPER_RUNNER_URL in CI the execution job fails within milliseconds and
  //   writes "failed", so the second trigger saw an idle scraper, skipped the
  //   409 branch and fell through to the rate limit — a 429, and the original
  //   flake.
  // - Ordering 409 first keeps any queued job out of the way. A preceding
  //   successful trigger queues an execution job that writes "failed" at an
  //   arbitrary moment, which can land on top of the status this test sets.
  test("should return 409 when triggering a run for an already-running scraper", async ({
    request,
    setScraperRunStatus,
  }) => {
    await setScraperRunStatus(scraperId, "running");

    const runResponse = await request.post(`${baseUrl}/api/scrapers/${scraperId}/run`, {
      headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
      timeout: 10000,
    });

    expect(runResponse.status()).toBe(409);

    const body = await runResponse.json();
    expect(body.error).toBe("Scraper is already running");
  });

  test("should trigger a manual scraper run via API", async ({ request, setScraperRunStatus }) => {
    // An idle scraper must be accepted outright. The previous [200, 409]
    // assertion passed either way and so could not distinguish "queued" from
    // "refused" — it would have gone green on the very bug above.
    await setScraperRunStatus(scraperId, "failed");

    const runResponse = await request.post(`${baseUrl}/api/scrapers/${scraperId}/run`, {
      headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
      timeout: 10000,
    });

    expect(runResponse.status()).toBe(200);

    const body = await runResponse.json();
    expect(body.message).toBe("Scraper run queued");
  });

  test("should clean up: delete scrapers and the scraper-repo", async ({ request }) => {
    // Let the execution job queued above settle first. Deleting mid-run races
    // the beforeDelete cascade: it clears scraper_runs, and a job still in
    // flight then inserts a run row referencing a scraper that is about to
    // disappear, which surfaces as a 500 from the FK.
    for (let attempt = 0; attempt < 30; attempt++) {
      const statusResponse = await request.get(`${baseUrl}/api/scrapers/${scraperId}`, {
        headers: { Authorization: `JWT ${token}` },
        timeout: 10000,
      });
      expect(statusResponse.status()).toBe(200);
      if ((await statusResponse.json()).lastRunStatus !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // First delete the associated scraper to avoid foreign key / hook errors
    const deleteScraperResponse = await request.delete(`${baseUrl}/api/scrapers/${scraperId}`, {
      headers: { Authorization: `JWT ${token}` },
      timeout: 10000,
    });

    expect(deleteScraperResponse.status()).toBe(200);

    // Now delete the repo itself
    const deleteResponse = await request.delete(`${baseUrl}/api/scraper-repos/${repoId}`, {
      headers: { Authorization: `JWT ${token}` },
      timeout: 10000,
    });

    expect(deleteResponse.status()).toBe(200);

    // Verify the repo is gone
    const getResponse = await request.get(`${baseUrl}/api/scraper-repos/${repoId}`, {
      headers: { Authorization: `JWT ${token}` },
      timeout: 10000,
    });

    expect(getResponse.status()).toBe(404);
  });

  test("should restore scrapers feature flag to disabled", async ({ request }) => {
    const getResponse = await request.get(`${baseUrl}/api/globals/settings`, {
      headers: { Authorization: `JWT ${token}` },
      timeout: 10000,
    });

    expect(getResponse.status()).toBe(200);
    const currentSettings = await getResponse.json();

    const updateResponse = await request.post(`${baseUrl}/api/globals/settings`, {
      headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
      data: { ...currentSettings, featureFlags: { ...currentSettings.featureFlags, enableScrapers: false } },
      timeout: 10000,
    });

    expect(updateResponse.status()).toBe(200);

    const restoreBody = await updateResponse.json();
    // Payload REST API wraps global update response in { result: <doc>, message: "..." }
    const restoredSettings = restoreBody.result ?? restoreBody;
    expect(restoredSettings.featureFlags.enableScrapers).toBe(false);
  });
});
