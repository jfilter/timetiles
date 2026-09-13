// @vitest-environment node
/**
 * Regression tests for pinning `turbo prune` in image builds.
 *
 * An unpinned `pnpm dlx turbo` resolves the newest release at build time, so
 * image builds would prune with a different turbo than the lockfile installs.
 *
 * @module
 * @category Unit Tests
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const VERSION_SCRIPT = "scripts/turbo-version.sh";

const readRepoFile = (relativePath: string) => readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");

describe.each([
  ["deployment/Dockerfile.prod", "web"],
  ["deployment/Dockerfile.allinone", "web"],
  ["apps/timescrape/Dockerfile", "timescrape"],
])("%s", (file, app) => {
  it("prunes with the turbo version locked in pnpm-lock.yaml", () => {
    const pruneLines = readRepoFile(file)
      .split("\n")
      .filter((line) => line.startsWith("RUN ") && line.includes(" prune ") && line.includes("--docker"));

    expect(pruneLines).toEqual([
      `RUN TURBO_VERSION="$(sh ${VERSION_SCRIPT})" && pnpm dlx "turbo@\${TURBO_VERSION}" prune ${app} --docker`,
    ]);
  });
});

describe(VERSION_SCRIPT, () => {
  it("prints the turbo version installed from the lockfile", () => {
    const requireFromRoot = createRequire(path.join(REPO_ROOT, "package.json"));
    const installed = (requireFromRoot("turbo/package.json") as { version: string }).version;

    const printed = execFileSync("sh", [VERSION_SCRIPT], { cwd: REPO_ROOT, encoding: "utf-8" }).trim();

    expect(printed).toBe(installed);
  });

  it("fails when the root importer does not resolve turbo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "turbo-version-"));
    try {
      const lockfile = path.join(dir, "pnpm-lock.yaml");
      writeFileSync(
        lockfile,
        "importers:\n\n  .:\n    devDependencies:\n      tsx:\n        specifier: ^4.0.0\n        version: 4.0.0\n"
      );

      const result = spawnSync("sh", [VERSION_SCRIPT, lockfile], { cwd: REPO_ROOT, encoding: "utf-8" });

      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
