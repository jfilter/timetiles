/**
 * E2E test for critical webhook import flow - minimal, no mocking
 * @module
 */

import { expect, test } from "@playwright/test";

import { setupE2EDatabase, teardownE2EDatabase } from "../helpers/database-setup";

test.describe("E2E Critical Webhook Import Flow", () => {
  let testContext: {
    catalogId: string;
    scheduledImportId: string;
    webhookToken: string;
    baseUrl: string;
  };

  test.beforeAll(async () => {
    // Setup test database with real data
    const setup = await setupE2EDatabase();
    
    // Create a scheduled import with webhook enabled via API
    const response = await fetch(`${setup.baseUrl}/api/scheduled-imports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.authToken}`,
      },
      body: JSON.stringify({
        name: "E2E Webhook Import Test",
        sourceUrl: "https://raw.githubusercontent.com/example/data/main/events.csv",
        catalog: setup.catalogId,
        enabled: true,
        webhookEnabled: true,
        scheduleType: "frequency",
        frequency: "daily",
        importNameTemplate: "Webhook Import - {{date}}",
        advancedOptions: {
          autoApproveSchema: true,
        },
      }),
    });

    const scheduledImport = await response.json();
    
    testContext = {
      catalogId: setup.catalogId,
      scheduledImportId: scheduledImport.id,
      webhookToken: scheduledImport.webhookToken,
      baseUrl: setup.baseUrl,
    };
  });

  test.afterAll(async () => {
    await teardownE2EDatabase();
  });

  test("should complete full webhook-triggered import from URL to events creation", async ({ page }) => {
    // Step 1: Trigger webhook (no mocking - actual HTTP request)
    const webhookUrl = `${testContext.baseUrl}/api/webhooks/trigger/${testContext.webhookToken}`;
    
    const triggerResponse = await fetch(webhookUrl, {
      method: "POST",
    });

    expect(triggerResponse.status).toBe(200);
    const triggerData = await triggerResponse.json();
    expect(triggerData.status).toBe("triggered");
    const jobId = triggerData.jobId;

    // Step 2: Wait for job processing (real job queue, no mocking)
    let jobStatus = "pending";
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    while (jobStatus === "pending" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      const jobResponse = await fetch(`${testContext.baseUrl}/api/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${testContext.authToken}`,
        },
      });
      
      const job = await jobResponse.json();
      jobStatus = job.status;
      attempts++;
    }

    expect(jobStatus).toBe("completed");

    // Step 3: Verify import file was created and processed
    const importFilesResponse = await fetch(
      `${testContext.baseUrl}/api/import-files?where[scheduledImport][equals]=${testContext.scheduledImportId}`,
      {
        headers: {
          Authorization: `Bearer ${testContext.authToken}`,
        },
      }
    );

    const importFiles = await importFilesResponse.json();
    expect(importFiles.docs).toHaveLength(1);
    expect(importFiles.docs[0].status).toBe("COMPLETED");

    // Step 4: Verify events were created
    const eventsResponse = await fetch(
      `${testContext.baseUrl}/api/events?where[catalog][equals]=${testContext.catalogId}`,
      {
        headers: {
          Authorization: `Bearer ${testContext.authToken}`,
        },
      }
    );

    const events = await eventsResponse.json();
    expect(events.totalDocs).toBeGreaterThan(0);

    // Step 5: Navigate to explore page and verify events appear
    await page.goto(`${testContext.baseUrl}/explore`);
    await page.waitForSelector("[data-testid='event-card']", { timeout: 10000 });
    
    const eventCards = await page.locator("[data-testid='event-card']").count();
    expect(eventCards).toBeGreaterThan(0);
  });

  test("should prevent concurrent webhook triggers", async () => {
    // Fire two webhook requests simultaneously (no mocking)
    const webhookUrl = `${testContext.baseUrl}/api/webhooks/trigger/${testContext.webhookToken}`;
    
    const [response1, response2] = await Promise.all([
      fetch(webhookUrl, { method: "POST" }),
      fetch(webhookUrl, { method: "POST" }),
    ]);

    // One should succeed, one should be rate limited or skipped
    const statuses = [response1.status, response2.status];
    
    // One 200 (success), one 429 (rate limited) or 200 with skipped status
    expect(statuses).toContain(200);
    
    const data1 = await response1.json();
    const data2 = await response2.json();
    
    const results = [data1, data2];
    const triggered = results.filter((r) => r.status === "triggered");
    const skippedOrLimited = results.filter((r) => r.status === "skipped" || r.error === "Rate limit exceeded");
    
    expect(triggered.length).toBeLessThanOrEqual(1);
    expect(skippedOrLimited.length).toBeGreaterThanOrEqual(1);
  });
});