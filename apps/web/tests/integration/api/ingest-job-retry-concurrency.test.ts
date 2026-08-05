// @vitest-environment node
/**
 * Concurrency regression test for the ingest-job retry endpoint.
 *
 * Two concurrent retries of the same FAILED job must not both queue a
 * workflow — the stage check and the enqueue must be atomic.
 *
 * @module
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Isolate the concurrency race from the endpoint's own rate limiting (burst
// limit of 1/min would otherwise 429 the second concurrent call regardless).
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

import { POST as retryPOST } from "@/app/api/ingest-jobs/[id]/retry/route";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import type { Catalog, Dataset, IngestFile, User } from "@/payload-types";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Ingest job retry — concurrency", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;
  let owner: User;
  let catalog: Catalog;
  let dataset: Dataset;
  let ingestFile: IngestFile;

  const callRetry = async (id: number, token: string) => {
    const request = new NextRequest(`http://localhost:3000/api/ingest-jobs/${id}/retry`, {
      method: "POST",
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    });
    return retryPOST(request, { params: Promise.resolve({ id: String(id) }) });
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { owner: { role: "user", _verified: true } });
    owner = users.owner;

    const catResult = await withCatalog(testEnv, { name: "Retry Catalog", isPublic: false, user: owner });
    catalog = catResult.catalog;

    const dsResult = await withDataset(testEnv, catalog.id, { name: "Retry Dataset", isPublic: false });
    dataset = dsResult.dataset;

    const ifResult = await withIngestFile(testEnv, catalog.id, "name,location\nEvent,Berlin", {
      user: owner.id,
      status: "failed",
    });
    ingestFile = ifResult.ingestFile;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  it("queues the ingest-process workflow exactly once for two concurrent retries", async () => {
    const ingestJob = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.FAILED },
      overrideAccess: true,
    });

    const login = await payload.login({
      collection: "users",
      data: { email: owner.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    const token = login.token as string;

    const [first, second] = await Promise.all([callRetry(ingestJob.id, token), callRetry(ingestJob.id, token)]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    // Exactly one succeeds; the other finds the job no longer FAILED.
    expect(statuses).toEqual([200, 400]);

    const queuedJobs = await payload.find({
      collection: "payload-jobs",
      where: {
        and: [
          { workflowSlug: { equals: "ingest-process" } },
          { "input.ingestJobId": { equals: String(ingestJob.id) } },
        ],
      },
      overrideAccess: true,
    });
    expect(queuedJobs.docs).toHaveLength(1);
  });
});
