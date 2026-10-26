// @vitest-environment node
/**
 * Integration tests for the multipart limits of Payload's REST and admin upload parser.
 *
 * Payload caps a multipart request at 50 MiB and a file at 20 MiB unless the config raises
 * them; the app's upload config must let a file up to its own per-file cap through.
 *
 * @module
 * @category Integration Tests
 */
import { rm } from "node:fs/promises";

import { addDataAndFileToRequest, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_UPLOAD_FILE_BYTES } from "@/lib/config/payload-shared-config";
import { PUBLIC_QUOTAS } from "@/lib/constants/quota-constants";

import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

const MiB = 1024 * 1024;

describe("Multipart upload limits", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  /** Runs a multipart POST carrying one file of `bytes` through Payload's request parser. */
  const parseUpload = async (bytes: number) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "text/csv" }), "events.csv");
    // Serialized up front: undici's streamed FormData body throws once the parser aborts reading it.
    const encoded = new Response(form);
    const request = new Request("http://localhost/api/ingest-files", {
      method: "POST",
      headers: { "content-type": encoded.headers.get("content-type") ?? "" },
      body: await encoded.arrayBuffer(),
    });
    const req = Object.assign(request, { payload: testEnv.payload }) as unknown as PayloadRequest;
    try {
      await addDataAndFileToRequest(req);
      return req.file;
    } finally {
      if (req.file?.tempFilePath) await rm(req.file.tempFilePath, { force: true });
    }
  };

  it("accepts a file larger than Payload's default request cap", async () => {
    const file = await parseUpload(60 * MiB);

    expect(file?.size).toBe(60 * MiB);
  }, 60000);

  it("accepts a file at the advertised file-size limit", async () => {
    const bytes = PUBLIC_QUOTAS.FILE_SIZE_MB.displayCap * MiB;
    const file = await parseUpload(bytes);

    expect(file?.size).toBe(bytes);
  }, 60000);

  it("rejects a file above the per-file cap", async () => {
    await expect(parseUpload(MAX_UPLOAD_FILE_BYTES + 1)).rejects.toMatchObject({ status: 413 });
  }, 60000);
});
