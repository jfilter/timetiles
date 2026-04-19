/**
 * Unit tests for Scraper Repo Sync Job Handler.
 *
 * Tests the scraper-repo-sync job which clones a git repo or reads inline
 * code, parses the scrapers.yml manifest, and upserts/deletes scraper
 * records to match the manifest.
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedScraper } from "@/lib/ingest/manifest-parser";
import { scraperRepoSyncJob } from "@/lib/jobs/handlers/scraper-repo-sync-job";
import type * as UrlValidationModule from "@/lib/security/url-validation";

const mocks = vi.hoisted(() => ({
  execFileAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  validateResolvedPublicHostname: vi.fn().mockResolvedValue(undefined),
}));

// Mock dependencies
vi.mock("@/lib/logger", () => ({ logger: mocks.logger, createLogger: () => mocks.logger, logError: vi.fn() }));

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

vi.mock("node:util", () => ({ promisify: () => mocks.execFileAsync }));

vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn().mockResolvedValue("/private/var/folders/scraper-repo-abc123"),
  readFile: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:os", () => ({ tmpdir: () => "/tmp" }));

vi.mock("@/lib/ingest/manifest-parser", () => ({ parseManifest: vi.fn() }));

vi.mock("@/lib/security/url-validation", async () => {
  const actual = await vi.importActual<typeof UrlValidationModule>("@/lib/security/url-validation");

  return { ...actual, validateResolvedPublicHostname: mocks.validateResolvedPublicHostname };
});

describe.sequential("scraperRepoSyncJob", () => {
  let mockPayload: any;

  const createMockContext = (input: { scraperRepoId: number }) => ({
    req: { payload: mockPayload },
    job: { id: "sync-job-1" },
    input,
  });

  const createParsedScraper = (overrides: Partial<ParsedScraper> = {}): ParsedScraper => ({
    name: "Test Scraper",
    slug: "test-scraper",
    runtime: "python",
    entrypoint: "main.py",
    output: "data.csv",
    schedule: "0 * * * *",
    limits: { timeout: 300, memory: 512 },
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn().mockResolvedValue({ docs: [] }),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };

    // Re-apply filesystem mocks after clearAllMocks
    const fsp = await import("node:fs/promises");
    (fsp.mkdtemp as any).mockResolvedValue("/private/var/folders/scraper-repo-abc123");
    (fsp.rm as any).mockResolvedValue(undefined);
    mocks.execFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
    mocks.validateResolvedPublicHostname.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should load repo by ID", async () => {
    const repo = {
      id: 5,
      sourceType: "upload",
      code: { "scrapers.yml": "scrapers:\n  - name: S1\n    slug: s1\n    entrypoint: main.py" },
      createdBy: 100,
    };

    mockPayload.findByID.mockResolvedValue(repo);

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({
      success: true,
      scrapers: [createParsedScraper({ name: "S1", slug: "s1" })],
    });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    expect(mockPayload.findByID).toHaveBeenCalledWith({ collection: "scraper-repos", id: 5, overrideAccess: true });
  });

  it("should read scrapers.yml from inline code (upload source type)", async () => {
    const yamlContent = "scrapers:\n  - name: Inline Scraper\n    slug: inline-scraper\n    entrypoint: run.py";
    const repo = {
      id: 5,
      sourceType: "upload",
      code: { "scrapers.yml": yamlContent, "run.py": "print('hello')" },
      createdBy: 100,
    };

    mockPayload.findByID.mockResolvedValue(repo);

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({
      success: true,
      scrapers: [createParsedScraper({ name: "Inline Scraper", slug: "inline-scraper", entrypoint: "run.py" })],
    });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    // parseManifest should be called with the yaml content from inline code
    expect(parseManifest).toHaveBeenCalledWith(yamlContent);
  });

  it("should create new scrapers from parsed manifest", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "scrapers: ..." }, createdBy: 100 };

    mockPayload.findByID.mockResolvedValue(repo);
    mockPayload.find.mockResolvedValue({ docs: [] });

    const parsedScrapers = [
      createParsedScraper({ name: "Scraper A", slug: "scraper-a", entrypoint: "a.py" }),
      createParsedScraper({ name: "Scraper B", slug: "scraper-b", entrypoint: "b.py", runtime: "node" }),
    ];

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({ success: true, scrapers: parsedScrapers });

    const context = createMockContext({ scraperRepoId: 5 });
    const result = await scraperRepoSyncJob.handler(context as any);

    // Should create two scrapers
    expect(mockPayload.create).toHaveBeenCalledTimes(2);

    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: "scrapers",
      data: expect.objectContaining({
        name: "Scraper A",
        slug: "scraper-a",
        repo: 5,
        runtime: "python",
        entrypoint: "a.py",
        outputFile: "data.csv",
        enabled: true,
      }),
      overrideAccess: true,
    });

    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: "scrapers",
      data: expect.objectContaining({
        name: "Scraper B",
        slug: "scraper-b",
        runtime: "node",
        entrypoint: "b.py",
        enabled: true,
      }),
      overrideAccess: true,
    });

    expect(result.output).toEqual(expect.objectContaining({ success: true, created: 2, updated: 0, deleted: 0 }));
  });

  it("should update existing scrapers when manifest changes", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "scrapers: ..." }, createdBy: 100 };

    mockPayload.findByID.mockResolvedValue(repo);

    // Existing scraper with the same slug
    const existingScraper = { id: 50, slug: "my-scraper", name: "Old Name", repo: 5 };
    mockPayload.find.mockResolvedValue({ docs: [existingScraper] });

    const parsedScrapers = [createParsedScraper({ name: "New Name", slug: "my-scraper", entrypoint: "updated.py" })];

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({ success: true, scrapers: parsedScrapers });

    const context = createMockContext({ scraperRepoId: 5 });
    const result = await scraperRepoSyncJob.handler(context as any);

    // Should update the existing scraper, not create a new one
    expect(mockPayload.create).not.toHaveBeenCalled();

    // Filter for scraper updates (not repo status updates)
    const scraperUpdateCalls = mockPayload.update.mock.calls.filter(
      (call: unknown[]) => (call[0] as { collection: string }).collection === "scrapers"
    );
    expect(scraperUpdateCalls).toHaveLength(1);
    expect(scraperUpdateCalls[0][0]).toEqual(
      expect.objectContaining({
        collection: "scrapers",
        id: 50,
        data: expect.objectContaining({ name: "New Name", slug: "my-scraper", entrypoint: "updated.py", repo: 5 }),
        overrideAccess: true,
      })
    );

    expect(result.output).toEqual(expect.objectContaining({ success: true, created: 0, updated: 1, deleted: 0 }));
  });

  it("should delete scrapers no longer in manifest", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "scrapers: ..." }, createdBy: 100 };

    mockPayload.findByID.mockResolvedValue(repo);

    // Two existing scrapers -- one will be kept, one removed
    const existingScrapers = [
      { id: 50, slug: "keep-this", name: "Keep This", repo: 5 },
      { id: 51, slug: "remove-this", name: "Remove This", repo: 5 },
    ];
    mockPayload.find.mockResolvedValue({ docs: existingScrapers });

    // Manifest only has keep-this
    const parsedScrapers = [createParsedScraper({ name: "Keep This", slug: "keep-this", entrypoint: "keep.py" })];

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({ success: true, scrapers: parsedScrapers });

    const context = createMockContext({ scraperRepoId: 5 });
    const result = await scraperRepoSyncJob.handler(context as any);

    // Should delete the scraper-runs for the removed scraper first
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "scraper-runs",
      where: { scraper: { equals: 51 } },
      overrideAccess: true,
    });
    // Then delete the scraper itself
    expect(mockPayload.delete).toHaveBeenCalledWith({ collection: "scrapers", id: 51, overrideAccess: true });

    // Should update the kept scraper
    const scraperUpdateCalls = mockPayload.update.mock.calls.filter(
      (call: unknown[]) => (call[0] as { collection: string }).collection === "scrapers"
    );
    expect(scraperUpdateCalls).toHaveLength(1);
    expect(scraperUpdateCalls[0][0]).toEqual(
      expect.objectContaining({ collection: "scrapers", id: 50, data: expect.objectContaining({ slug: "keep-this" }) })
    );

    expect(result.output).toEqual(expect.objectContaining({ success: true, created: 0, updated: 1, deleted: 1 }));
  });

  it("should update repo lastSyncStatus to 'success' on success", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "scrapers: ..." }, createdBy: 100 };

    mockPayload.findByID.mockResolvedValue(repo);
    mockPayload.find.mockResolvedValue({ docs: [] });

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({ success: true, scrapers: [createParsedScraper()] });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    // Find the repo status update call
    const repoUpdateCalls = mockPayload.update.mock.calls.filter(
      (call: unknown[]) => (call[0] as { collection: string }).collection === "scraper-repos"
    );

    expect(repoUpdateCalls).toHaveLength(1);
    expect(repoUpdateCalls[0][0]).toEqual(
      expect.objectContaining({
        collection: "scraper-repos",
        id: 5,
        data: expect.objectContaining({ lastSyncAt: expect.any(String), lastSyncStatus: "success", lastSyncError: "" }),
        overrideAccess: true,
      })
    );
  });

  it("should update repo lastSyncStatus to 'failed' with error on failure", async () => {
    // Repo not found
    mockPayload.findByID.mockResolvedValue(null);

    const context = createMockContext({ scraperRepoId: 999 });

    await expect(scraperRepoSyncJob.handler(context as any)).rejects.toThrow("Scraper repo not found: 999");

    // Verify the repo was updated with failed status
    const repoUpdateCalls = mockPayload.update.mock.calls.filter(
      (call: unknown[]) => (call[0] as { collection: string }).collection === "scraper-repos"
    );

    expect(repoUpdateCalls).toHaveLength(1);
    expect(repoUpdateCalls[0][0]).toEqual(
      expect.objectContaining({
        collection: "scraper-repos",
        id: 999,
        data: expect.objectContaining({
          lastSyncAt: expect.any(String),
          lastSyncStatus: "failed",
          lastSyncError: expect.stringContaining("Scraper repo not found: 999"),
        }),
        overrideAccess: true,
      })
    );
  });

  it("should throw when git repo has no gitUrl", async () => {
    const repo = { id: 5, sourceType: "git", gitUrl: undefined, createdBy: 100 };
    mockPayload.findByID.mockResolvedValue(repo);

    const context = createMockContext({ scraperRepoId: 5 });
    await expect(scraperRepoSyncJob.handler(context as any)).rejects.toThrow("Git URL is required");
  });

  it("should throw when upload repo has no inline code", async () => {
    const repo = { id: 5, sourceType: "upload", code: null, createdBy: 100 };
    mockPayload.findByID.mockResolvedValue(repo);

    const context = createMockContext({ scraperRepoId: 5 });
    await expect(scraperRepoSyncJob.handler(context as any)).rejects.toThrow("No inline code found");
  });

  it("should throw when upload repo has no scrapers.yml in code", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "main.py": "print('hello')" }, createdBy: 100 };
    mockPayload.findByID.mockResolvedValue(repo);

    const context = createMockContext({ scraperRepoId: 5 });
    await expect(scraperRepoSyncJob.handler(context as any)).rejects.toThrow("No scrapers.yml found");
  });

  it("should throw when manifest parsing fails", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "invalid: yaml" }, createdBy: 100 };
    mockPayload.findByID.mockResolvedValue(repo);

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({ success: false, error: "Invalid manifest format" });

    const context = createMockContext({ scraperRepoId: 5 });
    await expect(scraperRepoSyncJob.handler(context as any)).rejects.toThrow("Invalid manifest format");
  });

  it("should handle git repo with custom branch", async () => {
    const repo = {
      id: 5,
      sourceType: "git",
      gitUrl: "https://github.com/test/repo.git",
      gitBranch: "develop",
      createdBy: 100,
    };
    mockPayload.findByID.mockResolvedValue(repo);

    const fsp = await import("node:fs/promises");
    (fsp.readFile as any).mockResolvedValue("scrapers:\n  - name: S1");

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({
      success: true,
      scrapers: [createParsedScraper({ name: "S1", slug: "s1" })],
    });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    expect(mockPayload.findByID).toHaveBeenCalledWith({ collection: "scraper-repos", id: 5, overrideAccess: true });
    expect(mocks.validateResolvedPublicHostname).toHaveBeenCalledWith("github.com");
    expect(mocks.execFileAsync).toHaveBeenCalledWith(
      "git",
      [
        "-c",
        "http.followRedirects=false",
        "clone",
        "--depth",
        "1",
        "--branch",
        "develop",
        "--single-branch",
        "https://github.com/test/repo.git",
        "/private/var/folders/scraper-repo-abc123",
      ],
      expect.objectContaining({ timeout: 60_000, env: expect.objectContaining({ GIT_TERMINAL_PROMPT: "0" }) })
    );
  });

  it("should default to main branch for git repos without gitBranch", async () => {
    const repo = {
      id: 5,
      sourceType: "git",
      gitUrl: "https://github.com/test/repo.git",
      // no gitBranch - should default to "main"
      createdBy: 100,
    };
    mockPayload.findByID.mockResolvedValue(repo);

    const fsp = await import("node:fs/promises");
    (fsp.readFile as any).mockResolvedValue("scrapers:\n  - name: S1");

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({
      success: true,
      scrapers: [createParsedScraper({ name: "S1", slug: "s1" })],
    });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    // Just verify it completes without error
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "scraper-repos",
        data: expect.objectContaining({ lastSyncStatus: "success" }),
      })
    );
  });

  it("should reject git URLs with embedded credentials before cloning", async () => {
    const repo = {
      id: 5,
      sourceType: "git",
      gitUrl: "https://token@github.com/test/repo.git",
      gitBranch: "main",
      createdBy: 100,
    };
    mockPayload.findByID.mockResolvedValue(repo);

    const context = createMockContext({ scraperRepoId: 5 });

    await expect(scraperRepoSyncJob.handler(context as any)).rejects.toThrow(
      "Git URLs must not include embedded credentials"
    );
    expect(mocks.execFileAsync).not.toHaveBeenCalled();
  });

  it("should handle createdBy as a populated relation object", async () => {
    const repo = {
      id: 5,
      sourceType: "upload",
      code: { "scrapers.yml": "scrapers: ..." },
      createdBy: { id: 42, email: "user@example.com" }, // populated
    };
    mockPayload.findByID.mockResolvedValue(repo);
    mockPayload.find.mockResolvedValue({ docs: [] });

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({
      success: true,
      scrapers: [createParsedScraper({ name: "S1", slug: "s1" })],
    });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    // The create call should include repoCreatedBy from the populated relation
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ repoCreatedBy: 42 }) })
    );
  });

  it("should handle null createdBy", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "scrapers: ..." }, createdBy: null };
    mockPayload.findByID.mockResolvedValue(repo);
    mockPayload.find.mockResolvedValue({ docs: [] });

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({
      success: true,
      scrapers: [createParsedScraper({ name: "S1", slug: "s1" })],
    });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    // Should still create successfully with undefined repoCreatedBy
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ repoCreatedBy: undefined }) })
    );
  });

  it("should handle failed status update during error path", async () => {
    // Repo not found
    mockPayload.findByID.mockResolvedValue(null);
    // Make the error status update also fail
    mockPayload.update.mockRejectedValue(new Error("Update also failed"));

    const context = createMockContext({ scraperRepoId: 999 });

    // Should still throw the original error even if update fails
    await expect(scraperRepoSyncJob.handler(context as any)).rejects.toThrow("Scraper repo not found: 999");
  });

  it("should read input from context.job.input when context.input is undefined", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "scrapers: ..." }, createdBy: 100 };
    mockPayload.findByID.mockResolvedValue(repo);
    mockPayload.find.mockResolvedValue({ docs: [] });

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({ success: true, scrapers: [createParsedScraper()] });

    // Use job.input instead of context.input
    const context = {
      req: { payload: mockPayload },
      job: { id: "sync-job-1", input: { scraperRepoId: 5 } },
      input: undefined,
    };

    await scraperRepoSyncJob.handler(context as any);

    expect(mockPayload.findByID).toHaveBeenCalledWith({ collection: "scraper-repos", id: 5, overrideAccess: true });
  });

  it("should pass scraper schedule as null when not in manifest", async () => {
    const repo = { id: 5, sourceType: "upload", code: { "scrapers.yml": "scrapers: ..." }, createdBy: 100 };
    mockPayload.findByID.mockResolvedValue(repo);
    mockPayload.find.mockResolvedValue({ docs: [] });

    const { parseManifest } = await import("@/lib/ingest/manifest-parser");
    (parseManifest as any).mockReturnValue({ success: true, scrapers: [createParsedScraper({ schedule: undefined })] });

    const context = createMockContext({ scraperRepoId: 5 });
    await scraperRepoSyncJob.handler(context as any);

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ schedule: null }) })
    );
  });
});
