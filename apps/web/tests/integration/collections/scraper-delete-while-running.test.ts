// @vitest-environment node
/**
 * Tests that deleting a scraper mid-run is refused rather than crashing.
 *
 * scraper_runs.scraper_id is NOT NULL while its foreign key declares
 * ON DELETE SET NULL — the database can never satisfy that combination, so the
 * cascade is emulated in a beforeDelete hook. That emulation used to delete the
 * runs first and let the parent delete follow, which failed at the foreign key
 * with an opaque 500 whenever an execution job inserted a run in between.
 *
 * These tests pin the two guarantees that replaced it: a running scraper
 * refuses deletion with a 409, and an idle one still cascades its runs.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Deleting a scraper while a run is in flight", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let user: User;
  let repoId: number;

  const createScraper = async (lastRunStatus: string | null) => {
    const scraper = await payload.create({
      collection: "scrapers",
      data: {
        name: `Delete Guard ${Date.now()}`,
        slug: `delete-guard-${Date.now()}`,
        repo: repoId,
        runtime: "python",
        entrypoint: "scraper.py",
        outputFile: "data.csv",
        enabled: true,
      },
      overrideAccess: true,
    });

    // lastRunStatus denies create and update at field level, so go around
    // Payload the same way the atomic claim in the trigger route does.
    if (lastRunStatus != null) {
      await payload.db.drizzle.execute(
        `UPDATE payload.scrapers SET last_run_status = '${lastRunStatus}' WHERE id = ${scraper.id}`
      );
    }

    return scraper.id as number;
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { owner: { role: "admin" } });
    user = users.owner;

    const repo = await payload.create({
      collection: "scraper-repos",
      data: {
        name: `Delete Guard Repo ${Date.now()}`,
        sourceType: "upload",
        code: { "scrapers.yml": "scrapers: []" },
        createdBy: user.id,
      },
      overrideAccess: true,
    });
    repoId = repo.id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  it("refuses to delete a running scraper instead of failing at the foreign key", async () => {
    const scraperId = await createScraper("running");

    await expect(payload.delete({ collection: "scrapers", id: scraperId, overrideAccess: true })).rejects.toThrow(
      /currently running/i
    );

    // The point of the guard is that the scraper survives — a 409 that still
    // deleted the row would be worse than the 500 it replaced.
    const survivor = await payload.findByID({ collection: "scrapers", id: scraperId, overrideAccess: true });
    expect(survivor.id).toBe(scraperId);
  });

  it("still cascades runs when the scraper is idle", async () => {
    const scraperId = await createScraper("failed");

    await payload.create({
      collection: "scraper-runs",
      data: { scraper: scraperId, status: "success", triggeredBy: "manual" },
      overrideAccess: true,
    });

    await payload.delete({ collection: "scrapers", id: scraperId, overrideAccess: true });

    const remainingRuns = await payload.find({
      collection: "scraper-runs",
      where: { scraper: { equals: scraperId } },
      overrideAccess: true,
    });
    expect(remainingRuns.totalDocs).toBe(0);
  });

  it("refuses a repo delete when one of its scrapers is running", async () => {
    const runningScraperId = await createScraper("running");

    // The bulk delete inside the repo's beforeDelete collects per-document
    // failures rather than throwing, so this used to slip through and die at
    // the foreign key instead.
    await expect(payload.delete({ collection: "scraper-repos", id: repoId, overrideAccess: true })).rejects.toThrow(
      /could not be deleted/i
    );

    const survivor = await payload.findByID({ collection: "scrapers", id: runningScraperId, overrideAccess: true });
    expect(survivor.id).toBe(runningScraperId);
  });
});
