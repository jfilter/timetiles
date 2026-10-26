// @vitest-environment node
/**
 * Integration test for create-schema-version running for several sheets at once.
 *
 * Workflow tasks share one request object, so sheets processed in parallel must
 * not see each other's Payload transactions while creating schema versions.
 *
 * @module
 */
import { createLocalReq } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { createSchemaVersionJob } from "@/lib/jobs/handlers/create-schema-version-job";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

const SHEETS = 5;
const ROUNDS = 20;

describe("create-schema-version with parallel sheets", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let catalogId: number;
  let userId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    const { users } = await withUsers(testEnv, {
      uploader: { role: "user", customQuotas: { maxIngestJobsPerDay: SHEETS * ROUNDS, maxFileUploadsPerDay: ROUNDS } },
    });
    userId = users.uploader.id;
    const { catalog } = await withCatalog(testEnv, { user: users.uploader });
    catalogId = catalog.id;
  }, 120000);

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  const createSheetJobs = async (round: number) => {
    const { payload } = testEnv;
    const { ingestFile } = await withIngestFile(testEnv, catalogId, "title,date\nEvent,2024-01-01", {
      status: "completed",
      user: userId,
    });
    return Promise.all(
      Array.from({ length: SHEETS }, async (_, sheetIndex) => {
        const { dataset } = await withDataset(testEnv, catalogId, {
          name: `Parallel ${round}-${sheetIndex}`,
          slug: `parallel-schema-${round}-${sheetIndex}-${crypto.randomUUID().slice(0, 8)}`,
        });
        const job = await payload.create({
          collection: "ingest-jobs",
          data: {
            ingestFile: ingestFile.id,
            dataset: dataset.id,
            sheetIndex,
            stage: PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
            schema: { type: "object", properties: { title: { type: "string" } } },
          },
          overrideAccess: true,
        });
        return { datasetId: dataset.id, jobId: job.id };
      })
    );
  };

  it("creates one schema version per sheet when sheets share the workflow request", async () => {
    const { payload } = testEnv;

    for (let round = 0; round < ROUNDS; round++) {
      const sheets = await createSheetJobs(round);
      const req = await createLocalReq({}, payload);
      const results = await Promise.allSettled(
        sheets.map(({ jobId }) => createSchemaVersionJob.handler({ input: { ingestJobId: jobId }, req }))
      );
      const failures = results.flatMap((result) => (result.status === "rejected" ? [String(result.reason)] : []));
      expect(failures).toEqual([]);

      for (const { datasetId, jobId } of sheets) {
        const versions = await payload.find({
          collection: "dataset-schemas",
          where: { dataset: { equals: datasetId } },
          overrideAccess: true,
        });
        const job = await payload.findByID({ collection: "ingest-jobs", id: jobId, depth: 0, overrideAccess: true });
        expect(versions.totalDocs).toBe(1);
        expect(job.datasetSchemaVersion).toEqual(versions.docs[0]?.id);
      }
    }
  }, 300000);
});
