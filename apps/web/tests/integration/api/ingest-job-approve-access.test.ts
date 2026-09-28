// @vitest-environment node
/**
 * Access control of the column-picker picks on ingest-job approval.
 *
 * The picks are written into the dataset's authored interpretation plan, so
 * they need update access to that dataset, not just ownership of the job.
 *
 * @module
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

import { POST as approvePOST } from "@/app/api/ingest-jobs/[id]/approve/route";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { REVIEW_REASONS } from "@/lib/constants/review-reasons";
import type { User } from "@/payload-types";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Ingest job approval — dataset plan access", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let owner: User;
  let contributor: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    const { users } = await withUsers(testEnv, {
      owner: { role: "user", _verified: true, trustLevel: "5" },
      contributor: { role: "user", _verified: true, trustLevel: "5" },
    });
    owner = users.owner;
    contributor = users.contributor;
  }, 60000);

  afterAll(async () => {
    await testEnv.cleanup();
  });

  const setupReviewJob = async (jobUser: User) => {
    const { catalog } = await withCatalog(testEnv, {
      name: `Public ${crypto.randomUUID()}`,
      isPublic: true,
      user: owner,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Owned dataset",
      isPublic: true,
      fieldMappingOverrides: { timestampPath: "date" },
    });
    const { ingestFile } = await withIngestFile(testEnv, catalog.id, "name,when\nA,2024-01-01", {
      user: jobUser.id,
      status: "processing",
    });
    const job = await payload.create({
      collection: "ingest-jobs",
      data: {
        ingestFile: ingestFile.id,
        dataset: dataset.id,
        stage: PROCESSING_STAGE.NEEDS_REVIEW,
        reviewReason: REVIEW_REASONS.NO_TIMESTAMP_DETECTED,
      },
      overrideAccess: true,
    });
    return { dataset, job };
  };

  const approveAs = async (user: User, jobId: number, body: Record<string, unknown>) => {
    const login = await payload.login({
      collection: "users",
      data: { email: user.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    return approvePOST(
      new NextRequest(`http://localhost:3000/api/ingest-jobs/${jobId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${login.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(jobId) }) }
    );
  };

  const readTimestampRole = async (datasetId: number) => {
    const dataset = await payload.findByID({ collection: "datasets", id: datasetId, overrideAccess: true });
    return (dataset.interpretationPlan as { roles?: { timestamp?: string | null } } | null)?.roles?.timestamp;
  };

  it("rejects picks from a contributor who cannot update the dataset", async () => {
    const { dataset, job } = await setupReviewJob(contributor);

    const response = await approveAs(contributor, job.id, { timestampPath: "when" });

    expect(response.status).toBe(403);
    expect(await readTimestampRole(dataset.id)).toBe("date");
    const unchangedJob = await payload.findByID({ collection: "ingest-jobs", id: job.id, overrideAccess: true });
    expect(unchangedJob.stage).toBe(PROCESSING_STAGE.NEEDS_REVIEW);
    expect(unchangedJob.schemaValidation?.approved).not.toBe(true);
  });

  it("applies picks from the dataset's catalog owner", async () => {
    const { dataset, job } = await setupReviewJob(owner);

    const response = await approveAs(owner, job.id, { timestampPath: "when" });

    expect(response.status).toBe(200);
    expect(await readTimestampRole(dataset.id)).toBe("when");
  });
});
