/**
 * Regression tests for quota claims made from collection create hooks.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const quotaMocks = vi.hoisted(() => ({
  checkAndIncrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
  getEffectiveQuotas: vi.fn(),
}));

vi.mock("@/lib/services/quota-service", () => ({ createQuotaService: vi.fn(() => quotaMocks) }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  catalogAfterChangeHooks,
  catalogAfterErrorHook,
  catalogBeforeChangeHooks,
} from "@/lib/collections/catalogs/hooks";
import { eventsAfterErrorHook, eventsBeforeChangeHook } from "@/lib/collections/events/hooks";
import { beforeValidateHooks as ingestFileBeforeValidateHooks } from "@/lib/collections/ingest-files/hooks";
import ScraperRepos from "@/lib/collections/scraper-repos";

const catalogQuotaHook = catalogBeforeChangeHooks[1];
const catalogAfterChangeHook = catalogAfterChangeHooks[0];
const ingestFileBeforeValidateHook = ingestFileBeforeValidateHooks[0];
const scraperRepoQuotaHook = ScraperRepos.hooks?.beforeChange?.[1];
const scraperRepoAfterErrorHook = ScraperRepos.hooks?.afterError?.[0];

if (!catalogQuotaHook || !catalogAfterChangeHook || !ingestFileBeforeValidateHook) {
  throw new Error("Expected catalog and ingest-file hooks to be configured");
}

if (!scraperRepoQuotaHook || !scraperRepoAfterErrorHook) {
  throw new Error("Expected scraper repo quota hooks to be configured");
}

const createReq = (id: string | number = "user-1") =>
  ({ user: { id, role: "user", trustLevel: "1" }, payload: {}, context: {} }) as never;

describe.sequential("quota compensation hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaMocks.checkAndIncrementUsage.mockResolvedValue(true);
    quotaMocks.decrementUsage.mockResolvedValue(undefined);
    quotaMocks.getEffectiveQuotas.mockReturnValue({ maxFileSizeMB: 10 });
  });

  it("does not count programmatic URL/scraper ingest files as file uploads", async () => {
    const req = {
      user: { id: "user-1", role: "user", trustLevel: "1" },
      payload: {},
      context: { skipFileUploadQuota: true },
      file: { size: 12, data: Buffer.from("id,name\n1,test") },
    } as never;

    await ingestFileBeforeValidateHook({ data: {}, operation: "create", req } as never);

    expect(quotaMocks.getEffectiveQuotas).toHaveBeenCalled();
    expect(quotaMocks.checkAndIncrementUsage).not.toHaveBeenCalled();
  });

  it("compensates catalog quota when create fails after the quota claim", async () => {
    const req = createReq(10);

    await catalogQuotaHook({ data: { isPublic: true }, operation: "create", req } as never);
    await catalogAfterErrorHook({ req } as never);

    expect(quotaMocks.checkAndIncrementUsage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10 }),
      "CATALOGS_PER_USER",
      1,
      req
    );
    expect(quotaMocks.decrementUsage).toHaveBeenCalledWith(10, "CATALOGS_PER_USER", 1, req);
  });

  it("keeps catalog quota claimed after a successful create", async () => {
    const req = createReq(11);

    await catalogQuotaHook({ data: { isPublic: true }, operation: "create", req } as never);
    await catalogAfterChangeHook({ doc: { id: 1 }, operation: "create", req } as never);
    await catalogAfterErrorHook({ req } as never);

    expect(quotaMocks.decrementUsage).not.toHaveBeenCalled();
  });

  it("compensates event quota when create fails after the quota claim", async () => {
    const req = createReq(12);

    await eventsBeforeChangeHook({ data: {}, operation: "create", req } as never);
    await eventsAfterErrorHook({ req } as never);

    expect(quotaMocks.decrementUsage).toHaveBeenCalledWith(12, "TOTAL_EVENTS", 1, req);
  });

  it("compensates scraper repo quota when create fails after the quota claim", async () => {
    const req = createReq(13);

    await scraperRepoQuotaHook({ data: {}, operation: "create", req } as never);
    await scraperRepoAfterErrorHook({ req } as never);

    expect(quotaMocks.decrementUsage).toHaveBeenCalledWith(13, "SCRAPER_REPOS", 1, req);
  });
});
