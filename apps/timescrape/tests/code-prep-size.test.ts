/**
 * Tests for the repository size limit during clone.
 *
 * @module
 * @category Tests
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitHttpServer } from "./helpers/git-http-server.js";
import { startGitHttpServer } from "./helpers/git-http-server.js";

// Real git against a loopback server, which the SSRF guard would refuse.
vi.mock("../src/lib/ssrf-guard.js", () => ({ resolvePublicGitTarget: vi.fn().mockResolvedValue(["127.0.0.1"]) }));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config.js", () => ({
  getConfig: () => ({ SCRAPER_MAX_REPO_SIZE_MB: 1, SCRAPER_GIT_CLONE_TIMEOUT: 60_000 }),
}));

const { prepareCode } = await import("../src/services/code-prep.js");

const MB = 1024 * 1024;

describe("cloneRepo size limit", () => {
  let codeDir: string;
  let server: GitHttpServer | undefined;
  const clone = (url: string) =>
    prepareCode({ run_id: "size", runtime: "python", entrypoint: "main.py", code_url: url }, codeDir);

  beforeEach(() => {
    codeDir = mkdtempSync(join(tmpdir(), "code-prep-size-"));
  });

  afterEach(async () => {
    const running = server;
    server = undefined;
    await running?.close();
    rmSync(codeDir, { recursive: true, force: true });
  });

  it("checks out a repository within the limit", async () => {
    server = await startGitHttpServer({ "main.py": "print('hi')\n", "lib/util.py": "x = 1\n" });

    await clone(server.url);

    expect(readFileSync(join(codeDir, "main.py"), "utf-8")).toBe("print('hi')\n");
    expect(readFileSync(join(codeDir, "lib/util.py"), "utf-8")).toBe("x = 1\n");
  });

  it("cuts the transfer once the server sends more than the limit", async () => {
    server = await startGitHttpServer({ "main.py": "pass\n", "blob.bin": randomBytes(3 * MB) });

    await expect(clone(server.url)).rejects.toMatchObject({
      code: "REPO_TOO_LARGE",
      statusCode: 413,
      message: "Repository transfer exceeded the 1MB limit",
    });
  });

  it("refuses a small pack that would check out larger than the limit, before writing it", async () => {
    server = await startGitHttpServer({ "main.py": "pass\n", "zeros.bin": Buffer.alloc(3 * MB) });

    await expect(clone(server.url)).rejects.toMatchObject({
      code: "REPO_TOO_LARGE",
      message: "Repository size (3.0MB) exceeds limit (1MB)",
    });
    expect(existsSync(join(codeDir, "zeros.bin"))).toBe(false);
    expect(readdirSync(codeDir).filter((name) => name !== ".git")).toEqual([]);
  });
});
