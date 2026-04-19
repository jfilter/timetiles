/**
 * Unit tests for webhook token resolution and atomic claim logic.
 *
 * Tests resolveWebhookToken (lookup across scheduled-ingests and scrapers),
 * claimScraperRunning, and claimScheduledIngestRunning (atomic running-status
 * claims via raw SQL).
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimScheduledIngestRunning, claimScraperRunning, resolveWebhookToken } from "@/lib/services/webhook-registry";

const createUpdateBuilder = (result: unknown[]) => {
  const builder = {
    set: vi.fn(() => builder),
    where: vi.fn(() => builder),
    returning: vi.fn(() => Promise.resolve(result)),
  };

  return builder;
};

const createMockPayload = () => ({ find: vi.fn(), db: { drizzle: { update: vi.fn() } } });

let mockPayload: ReturnType<typeof createMockPayload>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPayload = createMockPayload();
});

describe.sequential("resolveWebhookToken", () => {
  it("returns scheduled-ingest target when token found in scheduled-ingests", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 1, name: "My Import", webhookEnabled: true, webhookToken: "tok-abc" }],
    });

    const result = await resolveWebhookToken(mockPayload as any, "tok-abc");

    expect(result).toEqual({
      type: "scheduled-ingest",
      id: 1,
      name: "My Import",
      record: expect.objectContaining({ id: 1, webhookEnabled: true }),
    });

    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "scheduled-ingests",
        where: { webhookToken: { equals: "tok-abc" } },
        limit: 1,
        overrideAccess: true,
      })
    );
  });

  it("returns scraper target when token found in scrapers (not in scheduled-ingests)", async () => {
    // scheduled-ingests returns nothing
    mockPayload.find.mockResolvedValueOnce({ docs: [] });
    // scrapers returns a match
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 42, name: "My Scraper", webhookEnabled: true, webhookToken: "tok-xyz" }],
    });

    const result = await resolveWebhookToken(mockPayload as any, "tok-xyz");

    expect(result).toEqual({
      type: "scraper",
      id: 42,
      name: "My Scraper",
      record: expect.objectContaining({ id: 42, webhookEnabled: true }),
    });

    // Verify scrapers collection was queried
    expect(mockPayload.find).toHaveBeenCalledTimes(2);
    expect(mockPayload.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: "scrapers", where: { webhookToken: { equals: "tok-xyz" } } })
    );
  });

  it("returns null when token not found in either collection", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [] });
    mockPayload.find.mockResolvedValueOnce({ docs: [] });

    const result = await resolveWebhookToken(mockPayload as any, "nonexistent-token");

    expect(result).toBeNull();
    expect(mockPayload.find).toHaveBeenCalledTimes(2);
  });

  it("returns null when matched scheduled-ingest has webhookEnabled=false", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 5, name: "Disabled Import", webhookEnabled: false, webhookToken: "tok-disabled" }],
    });

    const result = await resolveWebhookToken(mockPayload as any, "tok-disabled");

    expect(result).toBeNull();
    // Should not proceed to check scrapers since we found a doc (just disabled)
    expect(mockPayload.find).toHaveBeenCalledTimes(1);
  });

  it("returns null when matched scraper has webhookEnabled=false", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [] });
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 10, name: "Disabled Scraper", webhookEnabled: false, webhookToken: "tok-off" }],
    });

    const result = await resolveWebhookToken(mockPayload as any, "tok-off");

    expect(result).toBeNull();
    expect(mockPayload.find).toHaveBeenCalledTimes(2);
  });

  it("checks scheduled-ingests before scrapers (priority)", async () => {
    // Both collections have a matching token - scheduled-ingests should win
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 1, name: "SI Match", webhookEnabled: true, webhookToken: "shared-tok" }],
    });
    // This mock should never be reached
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 2, name: "Scraper Match", webhookEnabled: true, webhookToken: "shared-tok" }],
    });

    const result = await resolveWebhookToken(mockPayload as any, "shared-tok");

    expect(result).toEqual(expect.objectContaining({ type: "scheduled-ingest", id: 1 }));
    // Only one find call - scrapers never checked when scheduled-ingest matches
    expect(mockPayload.find).toHaveBeenCalledTimes(1);
  });

  it("uses fallback name when scheduled-ingest name is missing", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 7, name: null, webhookEnabled: true, webhookToken: "tok-noname" }],
    });

    const result = await resolveWebhookToken(mockPayload as any, "tok-noname");

    expect(result).toEqual(expect.objectContaining({ name: "scheduled-ingest-7" }));
  });

  it("uses fallback name when scraper name is missing", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [] });
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 3, name: undefined, webhookEnabled: true, webhookToken: "tok-noname2" }],
    });

    const result = await resolveWebhookToken(mockPayload as any, "tok-noname2");

    expect(result).toEqual(expect.objectContaining({ name: "scraper-3" }));
  });
});

describe.sequential("claimScraperRunning", () => {
  it("returns true when claim succeeds (rows returned)", async () => {
    mockPayload.db.drizzle.update.mockImplementationOnce(() => createUpdateBuilder([{ id: 5 }]));

    const result = await claimScraperRunning(mockPayload as any, 5);

    expect(result).toBe(true);
    expect(mockPayload.db.drizzle.update).toHaveBeenCalledTimes(1);
  });

  it("returns false when already running (no rows)", async () => {
    mockPayload.db.drizzle.update.mockImplementationOnce(() => createUpdateBuilder([]));

    const result = await claimScraperRunning(mockPayload as any, 5);

    expect(result).toBe(false);
    expect(mockPayload.db.drizzle.update).toHaveBeenCalledTimes(1);
  });
});

describe.sequential("claimScheduledIngestRunning", () => {
  it("returns true when claim succeeds (rows returned)", async () => {
    mockPayload.db.drizzle.update.mockImplementationOnce(() => createUpdateBuilder([{ id: 10 }]));

    const result = await claimScheduledIngestRunning(mockPayload as any, 10);

    expect(result).toBe(true);
    expect(mockPayload.db.drizzle.update).toHaveBeenCalledTimes(1);
  });

  it("returns false when already running (no rows)", async () => {
    mockPayload.db.drizzle.update.mockImplementationOnce(() => createUpdateBuilder([]));

    const result = await claimScheduledIngestRunning(mockPayload as any, 10);

    expect(result).toBe(false);
    expect(mockPayload.db.drizzle.update).toHaveBeenCalledTimes(1);
  });
});
