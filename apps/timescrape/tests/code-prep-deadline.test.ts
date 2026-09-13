import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real git against a local server that accepts the connection and never answers.
// The SSRF guard is bypassed because the server is on loopback.
vi.mock("@timetiles/shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SCRAPER_CLONE_DEADLINE_SECONDS: 1,
}));
vi.mock("../src/lib/ssrf-guard.js", () => ({ assertGitTargetIsPublic: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config.js", () => ({
  getConfig: () => ({ SCRAPER_MAX_REPO_SIZE_MB: 50, SCRAPER_GIT_CLONE_TIMEOUT: 60_000 }),
}));

const { prepareCode } = await import("../src/services/code-prep.js");

describe("cloneRepo deadline", () => {
  const server = createServer(() => {
    // Never respond.
  });
  let codeDir: string;

  beforeEach(async () => {
    codeDir = mkdtempSync(join(tmpdir(), "code-prep-deadline-"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(codeDir, { recursive: true, force: true });
  });

  it("aborts a clone that outlives the total deadline", { timeout: 15_000 }, async () => {
    const { port } = server.address() as AddressInfo;
    const startedAt = Date.now();

    await expect(
      prepareCode(
        { run_id: "deadline", runtime: "python", entrypoint: "main.py", code_url: `http://127.0.0.1:${port}/r.git` },
        codeDir
      )
    ).rejects.toThrow("exceeded the 1s deadline");
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });
});
