// @vitest-environment node
/**
 * Integration tests for scraper collection access control.
 *
 * Tests access control for scraper-repos, scrapers, and scraper-runs collections,
 * including feature flag gating, trust level enforcement, and ownership-based
 * read restrictions.
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resetFeatureFlagService } from "@/lib/services/feature-flag-service";
import type { User } from "@/payload-types";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe.sequential("Scraper Collections Access Control", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];

  let adminUser: User;
  let trustedUser: User; // trust level 3
  let regularUser: User; // trust level 2

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, {
      admin: { role: "admin", trustLevel: "5" },
      trusted: { role: "user", trustLevel: "3" },
      regular: { role: "user", trustLevel: "2" },
    });

    adminUser = users.admin;
    trustedUser = users.trusted;
    regularUser = users.regular;
  }, 60_000);

  afterAll(async () => {
    // Reset enableScrapers to default (false) to avoid affecting other test files
    try {
      await payload.updateGlobal({
        slug: "settings",
        data: { featureFlags: { enableScrapers: false } },
        overrideAccess: true,
      });
    } catch {
      // Ignore cleanup errors
    }
    resetFeatureFlagService();

    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(["scraper-repos", "scrapers", "scraper-runs", "payload-jobs"]);
    resetFeatureFlagService();
  });

  /**
   * Helper: enable the scraper feature flag via Settings global.
   */
  const enableScrapers = async (): Promise<void> => {
    await payload.updateGlobal({
      slug: "settings",
      data: { featureFlags: { enableScrapers: true } },
      overrideAccess: true,
    });
    resetFeatureFlagService();
  };

  /**
   * Helper: disable the scraper feature flag via Settings global.
   */
  const disableScrapers = async (): Promise<void> => {
    await payload.updateGlobal({
      slug: "settings",
      data: { featureFlags: { enableScrapers: false } },
      overrideAccess: true,
    });
    resetFeatureFlagService();
  };

  it("should allow admin to create scraper-repo when feature is enabled", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Admin Repo", sourceType: "git", gitUrl: "https://github.com/example/repo.git" },
      user: adminUser,
      overrideAccess: false,
    });

    expect(repo.id).toBeDefined();
    expect(repo.name).toBe("Admin Repo");
    expect(repo.sourceType).toBe("git");
  });

  it("should allow regular user with trust level 3 to create scraper-repo when feature is enabled", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Trusted User Repo", sourceType: "upload", code: { "scraper.py": "print('hello')" } },
      user: trustedUser,
      overrideAccess: false,
    });

    expect(repo.id).toBeDefined();
    expect(repo.name).toBe("Trusted User Repo");
    expect(repo.sourceType).toBe("upload");
  });

  it("should reject scraper-repo creation for user with trust level 2", async () => {
    await enableScrapers();

    await expect(
      payload.create({
        collection: "scraper-repos",
        data: { name: "Low Trust Repo", sourceType: "git", gitUrl: "https://github.com/example/repo.git" },
        user: regularUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should reject scraper-repo creation when enableScrapers feature is disabled", async () => {
    await disableScrapers();

    await expect(
      payload.create({
        collection: "scraper-repos",
        data: { name: "Disabled Feature Repo", sourceType: "git", gitUrl: "https://github.com/example/repo.git" },
        user: trustedUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should allow regular user to read only their own scraper-repos", async () => {
    await enableScrapers();

    // Create repos owned by different users (using overrideAccess to bypass feature flag for setup)
    const trustedRepo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Trusted Repo", sourceType: "upload", code: { "scraper.py": "pass" }, createdBy: trustedUser.id },
      overrideAccess: true,
    });

    const adminRepo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Admin Repo", sourceType: "upload", code: { "scraper.py": "pass" }, createdBy: adminUser.id },
      overrideAccess: true,
    });

    // Trusted user should only see their own repo
    const trustedResult = await payload.find({ collection: "scraper-repos", user: trustedUser, overrideAccess: false });

    const trustedRepoIds = trustedResult.docs.map((doc: any) => doc.id);
    expect(trustedRepoIds).toContain(trustedRepo.id);
    expect(trustedRepoIds).not.toContain(adminRepo.id);
  });

  it("should allow admin to read all scraper-repos", async () => {
    await enableScrapers();

    // Create repos owned by different users
    const trustedRepo = await payload.create({
      collection: "scraper-repos",
      data: {
        name: "Trusted Owned Repo",
        sourceType: "upload",
        code: { "scraper.py": "pass" },
        createdBy: trustedUser.id,
      },
      overrideAccess: true,
    });

    const adminRepo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Admin Owned Repo", sourceType: "upload", code: { "scraper.py": "pass" }, createdBy: adminUser.id },
      overrideAccess: true,
    });

    // Admin should see all repos
    const adminResult = await payload.find({ collection: "scraper-repos", user: adminUser, overrideAccess: false });

    const adminRepoIds = adminResult.docs.map((doc: any) => doc.id);
    expect(adminRepoIds).toContain(trustedRepo.id);
    expect(adminRepoIds).toContain(adminRepo.id);
  });

  it("should restrict scraper-runs read access to owner's scrapers only", async () => {
    // Create repos owned by different users
    const trustedRepo = await payload.create({
      collection: "scraper-repos",
      data: {
        name: "Trusted Repo for Runs",
        sourceType: "upload",
        code: { "scraper.py": "pass" },
        createdBy: trustedUser.id,
      },
      overrideAccess: true,
    });

    const adminRepo = await payload.create({
      collection: "scraper-repos",
      data: {
        name: "Admin Repo for Runs",
        sourceType: "upload",
        code: { "scraper.py": "pass" },
        createdBy: adminUser.id,
      },
      overrideAccess: true,
    });

    // Create scrapers for each repo
    const trustedScraper = await payload.create({
      collection: "scrapers",
      data: {
        name: "Trusted Scraper",
        slug: "trusted-scraper",
        repo: trustedRepo.id,
        repoCreatedBy: trustedUser.id,
        runtime: "python",
        entrypoint: "scraper.py",
      },
      overrideAccess: true,
    });

    const adminScraper = await payload.create({
      collection: "scrapers",
      data: {
        name: "Admin Scraper",
        slug: "admin-scraper",
        repo: adminRepo.id,
        repoCreatedBy: adminUser.id,
        runtime: "python",
        entrypoint: "scraper.py",
      },
      overrideAccess: true,
    });

    // Create runs for each scraper
    const trustedRun = await payload.create({
      collection: "scraper-runs",
      data: { scraper: trustedScraper.id, scraperOwner: trustedUser.id, status: "success", triggeredBy: "manual" },
      overrideAccess: true,
    });

    const adminRun = await payload.create({
      collection: "scraper-runs",
      data: { scraper: adminScraper.id, scraperOwner: adminUser.id, status: "success", triggeredBy: "manual" },
      overrideAccess: true,
    });

    // Trusted user should only see runs for their own scrapers
    const trustedRunResult = await payload.find({
      collection: "scraper-runs",
      user: trustedUser,
      overrideAccess: false,
    });

    const trustedRunIds = trustedRunResult.docs.map((doc: any) => doc.id);
    expect(trustedRunIds).toContain(trustedRun.id);
    expect(trustedRunIds).not.toContain(adminRun.id);

    // Admin should see all runs
    const adminRunResult = await payload.find({ collection: "scraper-runs", user: adminUser, overrideAccess: false });

    const adminRunIds = adminRunResult.docs.map((doc: any) => doc.id);
    expect(adminRunIds).toContain(trustedRun.id);
    expect(adminRunIds).toContain(adminRun.id);
  });

  it("should queue scraper-repo-sync job when creating a scraper-repo", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Sync Trigger Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: adminUser,
      overrideAccess: false,
    });

    // Check that a scraper-repo-sync job was queued (before running it)
    const pendingJobs = await payload.find({
      collection: "payload-jobs",
      where: {
        taskSlug: { equals: "scraper-repo-sync" },
        "input.scraperRepoId": { equals: repo.id },
        completedAt: { exists: false },
      },
    });

    expect(pendingJobs.docs).toHaveLength(1);
  });
});
