// @vitest-environment node
/**
 * Regression tests for the repository pre-commit hook.
 *
 * Runs the real hook with `pnpm` and `git` replaced by stub scripts, so a failing
 * check can be simulated without linting the repository.
 *
 * @module
 * @category Unit Tests
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const HOOK = path.resolve(import.meta.dirname, "../../../../../.husky/pre-commit");

const tempDirs: string[] = [];

/** Run the hook with stubs; `failingCommand` makes the matching pnpm invocation exit 1. */
const runHook = (failingCommand: string | null): number | null => {
  const bin = mkdtempSync(path.join(tmpdir(), "pre-commit-hook-"));
  tempDirs.push(bin);
  const failure = failingCommand ? `case "$*" in *"${failingCommand}"*) exit 1;; esac\n` : "";
  writeFileSync(path.join(bin, "pnpm"), `#!/bin/sh\n${failure}exit 0\n`);
  writeFileSync(path.join(bin, "git"), '#!/bin/sh\necho "apps/web/lib/example.ts"\n');
  chmodSync(path.join(bin, "pnpm"), 0o755);
  chmodSync(path.join(bin, "git"), 0o755);

  const result = spawnSync("/bin/sh", [HOOK], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    stdio: "ignore",
  });
  return result.status;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe(".husky/pre-commit", () => {
  it("passes when every check passes", () => {
    expect(runHook(null)).toBe(0);
  });

  it.each(["oxfmt", "web lint", "web typecheck"])("blocks the commit when %s fails", (command) => {
    expect(runHook(command)).not.toBe(0);
  });
});
