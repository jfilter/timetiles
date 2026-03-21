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
    await testEnv.seedManager.truncate(["scraper-repos", "scrapers", "scraper-runs", "payload-jobs", "user-usage"]);
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

  // --- Scraper trust boundary tests ---

  it("should reject scraper creation for user with trust level 2", async () => {
    await enableScrapers();

    // Create a repo owned by regularUser via overrideAccess (bypassing trust check)
    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Regular Repo", sourceType: "upload", code: { "scraper.py": "pass" }, createdBy: regularUser.id },
      overrideAccess: true,
    });

    await expect(
      payload.create({
        collection: "scrapers",
        data: { name: "Blocked Scraper", slug: "blocked", repo: repo.id, runtime: "python", entrypoint: "scraper.py" },
        user: regularUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should reject scraper creation when feature flag is disabled", async () => {
    await disableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Disabled Repo", sourceType: "upload", code: { "scraper.py": "pass" }, createdBy: trustedUser.id },
      overrideAccess: true,
    });

    await expect(
      payload.create({
        collection: "scrapers",
        data: {
          name: "Disabled Scraper",
          slug: "disabled",
          repo: repo.id,
          runtime: "python",
          entrypoint: "scraper.py",
        },
        user: trustedUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should server-set repoCreatedBy from the repo owner on create", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Owned Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: trustedUser,
      overrideAccess: false,
    });

    const scraper = await payload.create({
      collection: "scrapers",
      data: { name: "My Scraper", slug: "my-scraper", repo: repo.id, runtime: "python", entrypoint: "scraper.py" },
      user: trustedUser,
      overrideAccess: false,
    });

    expect(scraper.repoCreatedBy).toBe(trustedUser.id);
  });

  it("should reject scraper creation when user does not own the repo", async () => {
    await enableScrapers();

    // Create a repo owned by admin
    const adminRepo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Admin Only Repo", sourceType: "upload", code: { "scraper.py": "pass" }, createdBy: adminUser.id },
      overrideAccess: true,
    });

    // Trusted user tries to create a scraper in admin's repo
    await expect(
      payload.create({
        collection: "scrapers",
        data: {
          name: "Hijack Scraper",
          slug: "hijack",
          repo: adminRepo.id,
          runtime: "python",
          entrypoint: "scraper.py",
        },
        user: trustedUser,
        overrideAccess: false,
      })
    ).rejects.toThrow("You can only create scrapers for your own scraper repos");
  });

  it("should strip client-sent repoCreatedBy on update", async () => {
    await enableScrapers();

    // Create repo and scraper owned by trusted user
    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Strip Test Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: trustedUser,
      overrideAccess: false,
    });

    const scraper = await payload.create({
      collection: "scrapers",
      data: { name: "Strip Test", slug: "strip-test", repo: repo.id, runtime: "python", entrypoint: "scraper.py" },
      user: trustedUser,
      overrideAccess: false,
    });

    // Try to hijack ownership via update
    const updated = await payload.update({
      collection: "scrapers",
      id: scraper.id,
      data: { repoCreatedBy: adminUser.id } as any,
      user: trustedUser,
      overrideAccess: false,
    });

    // repoCreatedBy should still be the original owner
    expect(updated.repoCreatedBy).toBe(trustedUser.id);
  });

  it("should reject entrypoint with path traversal", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Path Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: trustedUser,
      overrideAccess: false,
    });

    await expect(
      payload.create({
        collection: "scrapers",
        data: {
          name: "Traversal Scraper",
          slug: "traversal",
          repo: repo.id,
          runtime: "python",
          entrypoint: "../../etc/passwd",
        },
        user: trustedUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should reject entrypoint with absolute path", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Abs Path Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: trustedUser,
      overrideAccess: false,
    });

    await expect(
      payload.create({
        collection: "scrapers",
        data: {
          name: "Absolute Scraper",
          slug: "absolute",
          repo: repo.id,
          runtime: "python",
          entrypoint: "/etc/passwd",
        },
        user: trustedUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should reject envVars with reserved prefix keys", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Env Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: trustedUser,
      overrideAccess: false,
    });

    await expect(
      payload.create({
        collection: "scrapers",
        data: {
          name: "Reserved Env Scraper",
          slug: "reserved-env",
          repo: repo.id,
          runtime: "python",
          entrypoint: "scraper.py",
          envVars: { PAYLOAD_SECRET: "hack", NORMAL_VAR: "ok" },
        },
        user: trustedUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should reject envVars with invalid key names", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Invalid Key Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: trustedUser,
      overrideAccess: false,
    });

    await expect(
      payload.create({
        collection: "scrapers",
        data: {
          name: "Invalid Key Scraper",
          slug: "invalid-key",
          repo: repo.id,
          runtime: "python",
          entrypoint: "scraper.py",
          envVars: { "invalid-key": "value", "123start": "bad" },
        },
        user: trustedUser,
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });

  it("should allow valid envVars and entrypoint", async () => {
    await enableScrapers();

    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "Valid Repo", sourceType: "upload", code: { "scraper.py": "pass" } },
      user: trustedUser,
      overrideAccess: false,
    });

    const scraper = await payload.create({
      collection: "scrapers",
      data: {
        name: "Valid Scraper",
        slug: "valid-scraper",
        repo: repo.id,
        runtime: "python",
        entrypoint: "src/scraper.py",
        envVars: { API_KEY: "test123", DEBUG: "true" },
      },
      user: trustedUser,
      overrideAccess: false,
    });

    expect(scraper.entrypoint).toBe("src/scraper.py");
    expect(scraper.envVars).toEqual({ API_KEY: "test123", DEBUG: "true" });
  });

  it("should allow system operations (overrideAccess) to set repoCreatedBy", async () => {
    // This simulates what scraper-repo-sync does: update scraper with overrideAccess: true
    const repo = await payload.create({
      collection: "scraper-repos",
      data: { name: "System Repo", sourceType: "upload", code: { "scraper.py": "pass" }, createdBy: trustedUser.id },
      overrideAccess: true,
    });

    const scraper = await payload.create({
      collection: "scrapers",
      data: {
        name: "System Scraper",
        slug: "system-scraper",
        repo: repo.id,
        repoCreatedBy: trustedUser.id,
        runtime: "python",
        entrypoint: "scraper.py",
      },
      overrideAccess: true,
    });

    expect(scraper.repoCreatedBy).toBe(trustedUser.id);

    // System update should preserve repoCreatedBy (no req.user to strip it)
    const updated = await payload.update({
      collection: "scrapers",
      id: scraper.id,
      data: { repoCreatedBy: adminUser.id },
      overrideAccess: true,
    });

    expect(updated.repoCreatedBy).toBe(adminUser.id);
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
