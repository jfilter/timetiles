/**
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LoggerModule from "@/lib/logger";

// Mocked before import so job-completion.ts picks up the mock.
const mocks = vi.hoisted(() => ({ settleEventQuota: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/ingest/event-quota-ledger", () => ({
  releaseEventQuota: vi.fn(),
  reserveEventQuota: vi.fn(),
  settleEventQuota: mocks.settleEventQuota,
}));

vi.mock("@/lib/ingest/types/geocoding", () => ({ getIngestGeocodingResults: vi.fn(() => ({})) }));

vi.mock("@/lib/logger", async () => {
  const actual = await vi.importActual<typeof LoggerModule>("@/lib/logger");
  return { ...actual, createJobLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() })) };
});

import { markJobCompleted } from "@/lib/jobs/handlers/create-events-batch/job-completion";

describe("markJobCompleted quota settlement", () => {
  let mockPayload: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      findByID: vi.fn(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") {
          return Promise.resolve({
            id: 123,
            ingestFile: "file-789",
            duplicates: { internal: [], external: [], summary: {} },
            errors: [],
          });
        }
        if (collection === "ingest-files") {
          return Promise.resolve({ id: "file-789", user: { id: "user-1", role: "user" } });
        }
        return Promise.resolve(null);
      }),
      count: vi.fn().mockResolvedValue({ totalDocs: 505 }),
      update: vi.fn().mockResolvedValue({}),
    };
  });

  it("settles the generation's charge to the events this job newly created", async () => {
    await expect(markJobCompleted(mockPayload, 123, 4, 0)).resolves.toBe(505);

    expect(mocks.settleEventQuota).toHaveBeenCalledWith(mockPayload, {
      ingestJobId: 123,
      generation: 4,
      user: expect.objectContaining({ id: "user-1" }),
      actual: 505,
    });
  });

  it.each([
    ["skip", 3],
    ["update", 1],
  ])("records only the rows the %s strategy skipped as duplicatesSkipped", async (strategy, expected) => {
    mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve(
        collection === "ingest-jobs"
          ? {
              id: 123,
              configSnapshot: { idStrategy: { duplicateStrategy: strategy } },
              duplicates: { summary: { internalDuplicates: 1, externalDuplicates: 2 } },
              errors: [],
            }
          : null
      )
    );

    await markJobCompleted(mockPayload, 123, 0, strategy === "update" ? 2 : 0);

    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { results: expect.objectContaining({ duplicatesSkipped: expected }) } })
    );
  });
});
