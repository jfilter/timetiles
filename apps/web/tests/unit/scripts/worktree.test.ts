// @vitest-environment node
/**
 * Worktree commands reject unsafe names and preserve files when Git refuses removal.
 * @module
 * @category Tests
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "timetiles-worktree-test-"));
  mkdirSync(resolve(directory, "scripts"));
  mkdirSync(resolve(directory, "bin"));
  mkdirSync(resolve(directory, ".worktrees/feature"), { recursive: true });
  copyFileSync(
    resolve(import.meta.dirname, "../../../../../scripts/worktree.sh"),
    resolve(directory, "scripts/worktree.sh")
  );
  writeFileSync(resolve(directory, "bin/git"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  writeFileSync(resolve(directory, ".worktrees/feature/sentinel"), "uncommitted work");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

const run = (command: string, name: string) =>
  spawnSync("/bin/bash", [resolve(directory, "scripts/worktree.sh"), command, name], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10000,
    env: { NODE_ENV: "test", PATH: `${resolve(directory, "bin")}:/usr/bin:/bin` },
  });

it.each(["create", "remove"])("%s rejects path-like or option-like names", (command) => {
  for (const name of [".", "..", "../outside", "nested/feature", "/absolute", "-option"]) {
    const result = run(command, name);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Invalid worktree name");
  }
});

it("preserves the directory when Git refuses to remove it", () => {
  const result = run("remove", "feature");
  expect(result.status).not.toBe(0);
  expect(readFileSync(resolve(directory, ".worktrees/feature/sentinel"), "utf8")).toBe("uncommitted work");
});

it.each(["feature-123", "Uppercase", "fix.retry", "task_one"])("accepts the single-segment name %s", (name) => {
  const result = run("create", name);
  expect(result.stdout).toContain(`Creating worktree '${name}'`);
  // The Git stub rejects creation, after name validation has succeeded.
  expect(result.status).toBe(1);
});
