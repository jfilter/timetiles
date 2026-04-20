/**
 * @module
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ countUserDocs: vi.fn(), findUserDocs: vi.fn() }));

vi.mock("@/lib/config/env", () => ({ getEnv: () => ({ DATA_EXPORT_DIR: ".exports-test" }) }));

vi.mock("@/lib/utils/user-data", () => ({ countUserDocs: mocks.countUserDocs, findUserDocs: mocks.findUserDocs }));

import { createDataExportService } from "@/lib/export/service";

const createRecords = <T extends Record<string, unknown>>(count: number, factory: (index: number) => T): T[] =>
  Array.from({ length: count }, (_value, index) => factory(index));

describe.sequential("DataExportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.countUserDocs.mockResolvedValue(0);
    mocks.findUserDocs.mockImplementation((_payload, collection: string, userId: number, options = {}) => {
      const count = "limit" in options && options.limit === 10000 ? 10000 : 10001;

      switch (collection) {
        case "datasets":
          return createRecords(count, (index) => ({
            id: index + 1,
            name: `Dataset ${index + 1}`,
            catalog: 500 + index,
            language: "eng",
            createdBy: userId,
          }));
        case "ingest-files":
          return createRecords(count, (index) => ({
            id: index + 1,
            originalName: `import-${index + 1}.csv`,
            mimeType: "text/csv",
            filesize: 1024,
            status: "completed",
            user: userId,
          }));
        case "catalogs":
          return createRecords(count, (index) => ({ id: index + 1, name: `Catalog ${index + 1}`, createdBy: userId }));
        case "scheduled-ingests":
          return createRecords(count, (index) => ({
            id: index + 1,
            name: `Schedule ${index + 1}`,
            sourceUrl: `https://example.com/${index + 1}`,
            createdBy: userId,
          }));
        case "media":
          return createRecords(count, (index) => ({
            id: index + 1,
            filename: `media-${index + 1}.png`,
            mimeType: "image/png",
            filesize: 2048,
            createdBy: userId,
          }));
        case "scraper-repos":
          return createRecords(count, (index) => ({
            id: index + 1,
            name: `Repo ${index + 1}`,
            sourceType: "upload",
            createdBy: userId,
          }));
        default:
          return [];
      }
    });
  });

  it("should fetch summary inputs without a 10k cap", async () => {
    const payload = {
      count: vi
        .fn()
        .mockImplementation(({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
          switch (collection) {
            case "events":
              return { totalDocs: ((where.dataset as { in?: unknown[] }).in ?? []).length };
            case "dataset-schemas":
              return { totalDocs: ((where.dataset as { in?: unknown[] }).in ?? []).length };
            case "ingest-jobs":
              return { totalDocs: ((where.ingestFile as { in?: unknown[] }).in ?? []).length };
            case "audit-log":
            case "scrapers":
            case "scraper-runs":
              return { totalDocs: 0 };
            default:
              return { totalDocs: 0 };
          }
        }),
    } as any;

    const service = createDataExportService(payload);
    const summary = await service.getExportSummary(42);

    expect(summary.datasets).toBe(0);
    expect(summary.importFiles).toBe(0);
    expect(summary.events).toBe(10001);
    expect(summary.datasetSchemas).toBe(10001);
    expect(summary.importJobs).toBe(10001);

    expect(mocks.findUserDocs).toHaveBeenCalledWith(payload, "datasets", 42);
    expect(mocks.findUserDocs).toHaveBeenCalledWith(payload, "ingest-files", 42, { userField: "user" });
  });

  it("should fetch dependent export collections without truncating at 10k", async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValue({
          id: 42,
          email: "user@example.com",
          firstName: "Test",
          lastName: "User",
          role: "user",
          trustLevel: "basic",
          createdAt: "2024-01-01T00:00:00Z",
          lastLoginAt: "2024-01-02T00:00:00Z",
        }),
      find: vi
        .fn()
        .mockImplementation(
          ({ collection, pagination, limit }: { collection: string; pagination?: boolean; limit?: number }) => {
            const count = pagination === false && limit === undefined ? 10001 : 10000;

            switch (collection) {
              case "ingest-jobs":
                return {
                  docs: createRecords(count, (index) => ({
                    id: index + 1,
                    ingestFile: index + 1,
                    dataset: index + 1,
                    stage: "completed",
                    progress: {},
                    createdAt: "2024-01-01T00:00:00Z",
                    updatedAt: "2024-01-01T00:00:00Z",
                  })),
                };
              case "dataset-schemas":
                return {
                  docs: createRecords(count, (index) => ({
                    id: index + 1,
                    dataset: index + 1,
                    versionNumber: 1,
                    schema: { type: "object", properties: {} },
                    fieldMetadata: {},
                    eventCountAtCreation: 0,
                    createdAt: "2024-01-01T00:00:00Z",
                    updatedAt: "2024-01-01T00:00:00Z",
                  })),
                };
              case "audit-log":
                return {
                  docs: createRecords(count, (index) => ({
                    id: index + 1,
                    action: "account.email_changed",
                    timestamp: "2024-01-01T00:00:00Z",
                    details: { index },
                    createdAt: "2024-01-01T00:00:00Z",
                  })),
                };
              case "scrapers":
                return {
                  docs: createRecords(count, (index) => ({
                    id: index + 1,
                    name: `Scraper ${index + 1}`,
                    slug: `scraper-${index + 1}`,
                    repo: index + 1,
                    runtime: "python",
                    entrypoint: "run.py",
                    outputFile: "data.csv",
                    schedule: null,
                    enabled: true,
                    timeoutSecs: 60,
                    memoryMb: 256,
                    createdAt: "2024-01-01T00:00:00Z",
                    updatedAt: "2024-01-01T00:00:00Z",
                  })),
                };
              case "scraper-runs":
                return {
                  docs: createRecords(count, (index) => ({
                    id: index + 1,
                    scraper: index + 1,
                    status: "completed",
                    triggeredBy: "manual",
                    startedAt: "2024-01-01T00:00:00Z",
                    finishedAt: "2024-01-01T00:01:00Z",
                    durationMs: 60000,
                    exitCode: 0,
                    outputRows: 1,
                    outputBytes: 10,
                    createdAt: "2024-01-01T00:00:00Z",
                  })),
                };
              default:
                return { docs: [] };
            }
          }
        ),
    } as any;

    const service = createDataExportService(payload);
    const data = await service.fetchAllUserData(42);

    expect(data.datasets).toHaveLength(10001);
    expect(data.importFiles).toHaveLength(10001);
    expect(data.importJobs).toHaveLength(10001);
    expect(data.datasetSchemas).toHaveLength(10001);
    expect(data.auditLog).toHaveLength(10001);
    expect(data.scrapers).toHaveLength(10001);
    expect(data.scraperRuns).toHaveLength(10001);

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "ingest-jobs", pagination: false, overrideAccess: true })
    );
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "dataset-schemas", pagination: false, overrideAccess: true })
    );
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "audit-log", pagination: false, overrideAccess: true })
    );
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "scrapers", pagination: false, overrideAccess: true })
    );
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "scraper-runs", pagination: false, overrideAccess: true })
    );
  });
});
