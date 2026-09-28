import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// git itself is replaced: no real git prints count-objects without a size-pack line.
const countObjects = vi.hoisted(() => ({ stdout: "" }));
vi.mock("simple-git", () => ({
  simpleGit: () => ({ clone: vi.fn(), cwd: () => ({ raw: () => Promise.resolve(countObjects.stdout) }) }),
}));
vi.mock("../src/lib/ssrf-guard.js", () => ({ assertGitTargetIsPublic: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config.js", () => ({
  getConfig: () => ({ SCRAPER_MAX_REPO_SIZE_MB: 1, SCRAPER_GIT_CLONE_TIMEOUT: 60_000 }),
}));

const { prepareCode } = await import("../src/services/code-prep.js");

describe("cloneRepo size check", () => {
  let codeDir: string;
  const clone = () =>
    prepareCode({ run_id: "size", runtime: "python", entrypoint: "main.py", code_url: "https://x/r.git" }, codeDir);

  beforeEach(() => {
    codeDir = mkdtempSync(join(tmpdir(), "code-prep-size-"));
  });

  afterEach(() => {
    rmSync(codeDir, { recursive: true, force: true });
  });

  it("rejects a repository over the size limit", async () => {
    countObjects.stdout = "count: 0\nsize: 0\nin-pack: 9\npacks: 1\nsize-pack: 2048\n";

    await expect(clone()).rejects.toMatchObject({ code: "REPO_TOO_LARGE", statusCode: 413 });
  });

  it("refuses a clone whose size it cannot read instead of treating it as empty", async () => {
    countObjects.stdout = "count: 0\nsize: 0\n";

    await expect(clone()).rejects.toMatchObject({ code: "GIT_CLONE_FAILED" });
  });
});
