import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunnerError } from "../src/lib/errors.js";
import type { RunRequest } from "../src/types.js";

// Clones run real git against loopback servers, which the SSRF guard would refuse.
vi.mock("../src/lib/ssrf-guard.js", () => ({ assertGitTargetIsPublic: vi.fn().mockResolvedValue(undefined) }));

vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

vi.mock("../src/config.js", () => ({
  getConfig: vi.fn(() => ({ SCRAPER_MAX_REPO_SIZE_MB: 50, SCRAPER_GIT_CLONE_TIMEOUT: 60_000 })),
}));

describe("prepareCode", () => {
  let codeDir: string;

  beforeEach(() => {
    codeDir = mkdtempSync(join(tmpdir(), "code-prep-test-"));
  });

  afterEach(() => {
    if (existsSync(codeDir)) {
      rmSync(codeDir, { recursive: true, force: true });
    }
  });

  it("throws RunnerError when neither code_url nor code is provided", async () => {
    const { prepareCode } = await import("../src/services/code-prep.js");

    const request = { run_id: "test-1", runtime: "python", entrypoint: "main.py" } as RunRequest;

    await expect(prepareCode(request, codeDir)).rejects.toThrow(RunnerError);
    await expect(prepareCode(request, codeDir)).rejects.toThrow("Either code_url or code must be provided");
  });

  describe("cloneRepo", () => {
    const listen = async (handler: Parameters<typeof createServer>[0]) => {
      const server = createServer(handler);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
    };

    it("refuses an HTTP redirect so git never reaches a host the SSRF guard did not inspect", async () => {
      let internalHits = 0;
      let publicHits = 0;
      const internal = await listen((_req, res) => {
        internalHits++;
        res.writeHead(404).end();
      });
      const redirecting = await listen((req, res) => {
        publicHits++;
        res.writeHead(302, { Location: `${internal.url}${req.url}` }).end();
      });

      try {
        const { prepareCode } = await import("../src/services/code-prep.js");
        await expect(
          prepareCode(
            { run_id: "redirect", runtime: "python", entrypoint: "main.py", code_url: `${redirecting.url}/r.git` },
            codeDir
          )
        ).rejects.toMatchObject({ code: "GIT_CLONE_FAILED" });

        expect(publicHits).toBeGreaterThan(0);
        expect(internalHits).toBe(0);
      } finally {
        redirecting.server.close();
        internal.server.close();
      }
    });
  });

  describe("writeInlineCode", () => {
    it("writes files to correct paths", async () => {
      const { prepareCode } = await import("../src/services/code-prep.js");

      const request: RunRequest = {
        run_id: "test-2",
        runtime: "python",
        entrypoint: "scraper.py",
        code: { "scraper.py": "print('hello')" },
      };

      await prepareCode(request, codeDir);

      const filePath = join(codeDir, "scraper.py");
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe("print('hello')");
    });

    it("creates subdirectories for nested paths", async () => {
      const { prepareCode } = await import("../src/services/code-prep.js");

      const request: RunRequest = {
        run_id: "test-3",
        runtime: "python",
        entrypoint: "src/main.py",
        code: { "src/lib/utils.py": "def helper(): pass" },
      };

      await prepareCode(request, codeDir);

      const filePath = join(codeDir, "src", "lib", "utils.py");
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe("def helper(): pass");
    });

    it("rejects filenames with .. (path traversal)", async () => {
      const { prepareCode } = await import("../src/services/code-prep.js");

      const request: RunRequest = {
        run_id: "test-4",
        runtime: "python",
        entrypoint: "scraper.py",
        code: { "../etc/passwd": "malicious" },
      };

      await expect(prepareCode(request, codeDir)).rejects.toThrow(RunnerError);
      await expect(prepareCode(request, codeDir)).rejects.toThrow("Invalid filename");
    });

    it("rejects filenames starting with /", async () => {
      const { prepareCode } = await import("../src/services/code-prep.js");

      const request: RunRequest = {
        run_id: "test-5",
        runtime: "python",
        entrypoint: "scraper.py",
        code: { "/etc/passwd": "malicious" },
      };

      await expect(prepareCode(request, codeDir)).rejects.toThrow(RunnerError);
      await expect(prepareCode(request, codeDir)).rejects.toThrow("Invalid filename");
    });

    it("rejects a file tree the filesystem cannot hold as a bad request", async () => {
      const { prepareCode } = await import("../src/services/code-prep.js");

      const request: RunRequest = {
        run_id: "test-8",
        runtime: "python",
        entrypoint: "scraper.py",
        code: { lib: "a file", "lib/helper.py": "under a file" },
      };

      await expect(prepareCode(request, codeDir)).rejects.toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });
    });

    it("handles multiple files", async () => {
      const { prepareCode } = await import("../src/services/code-prep.js");

      const request: RunRequest = {
        run_id: "test-6",
        runtime: "node",
        entrypoint: "index.js",
        code: {
          "index.js": "require('./lib/helper')",
          "lib/helper.js": "module.exports = {}",
          "config.json": '{"key": "value"}',
        },
      };

      await prepareCode(request, codeDir);

      expect(existsSync(join(codeDir, "index.js"))).toBe(true);
      expect(existsSync(join(codeDir, "lib", "helper.js"))).toBe(true);
      expect(existsSync(join(codeDir, "config.json"))).toBe(true);

      expect(readFileSync(join(codeDir, "index.js"), "utf-8")).toBe("require('./lib/helper')");
      expect(readFileSync(join(codeDir, "lib", "helper.js"), "utf-8")).toBe("module.exports = {}");
      expect(readFileSync(join(codeDir, "config.json"), "utf-8")).toBe('{"key": "value"}');
    });
  });
});
