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

import { scraperRepoSyncJob } from "@/lib/jobs/handlers/scraper-repo-sync-job";
import type { ParsedScraper } from "@/lib/services/manifest-parser";

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

vi.mock("node:util", () => ({ promisify: () => vi.fn().mockResolvedValue({ stdout: "", stderr: "" }) }));

vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn().mockResolvedValue("/private/var/folders/scraper-repo-abc123"),
  readFile: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:os", () => ({ tmpdir: () => "/tmp" }));

vi.mock("@/lib/services/manifest-parser", () => ({ parseManifest: vi.fn() }));

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should load repo by ID", async () => {
    const repo = {
      id: 5,
      sourceType: "upload",
      code: { "scrapers.yml": "scrapers:\n  - name: S1\n    slug: s1\n    entrypoint: main.py" },
      createdBy: 100,
    };

    mockPayload.findByID.mockResolvedValue(repo);

    const { parseManifest } = await import("@/lib/services/manifest-parser");
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

    const { parseManifest } = await import("@/lib/services/manifest-parser");
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

    const { parseManifest } = await import("@/lib/services/manifest-parser");
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

    const { parseManifest } = await import("@/lib/services/manifest-parser");
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

    const { parseManifest } = await import("@/lib/services/manifest-parser");
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

    const { parseManifest } = await import("@/lib/services/manifest-parser");
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
});
