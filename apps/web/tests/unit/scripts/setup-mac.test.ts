// @vitest-environment node
/**
 * Isolated macOS setup build-directory ownership checks.
 * @module
 * @category Tests
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "../../../../../scripts/setup-mac.sh"), "utf8");
const buildFunction = /^install_h3_extension\(\) \{\n[\s\S]*?^\}/m.exec(source)?.[0];
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "timetiles-mac-setup-"));
  mkdirSync(resolve(directory, "h3-pg-build"));
  writeFileSync(resolve(directory, "h3-pg-build/sentinel"), "owned by another run");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

it.each([0, 1])("preserves existing build directories when cloning exits %s", (cloneStatus) => {
  expect(buildFunction).toBeDefined();
  const result = spawnSync(
    "/bin/bash",
    [
      "-c",
      `set -eu
pg_config() { printf '%s\\n' "$TMPDIR/missing"; }
brew() { printf '%s\\n' "$TMPDIR/prefix"; }
git() { return ${cloneStatus}; }
cmake() { return 0; }
print_success() { :; }
print_exists() { :; }
warn() { :; }
${buildFunction}
install_h3_extension`,
    ],
    { encoding: "utf8", timeout: 10000, env: { NODE_ENV: "test", PATH: "/usr/bin:/bin", TMPDIR: directory } }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(readdirSync(directory)).toEqual(["h3-pg-build"]);
  expect(readFileSync(resolve(directory, "h3-pg-build/sentinel"), "utf8")).toBe("owned by another run");
});
