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

it.each(["#port = 5432\n", "port = 6543\n"])("handles PostgreSQL config %s", (config) => {
  const postgresFunction = /^setup_postgres\(\) \{\n[\s\S]*?^\}/m.exec(source)?.[0];
  expect(postgresFunction).toBeDefined();
  const cluster = resolve(directory, "var/postgresql@17");
  mkdirSync(cluster, { recursive: true });
  const configPath = resolve(cluster, "postgresql.conf");
  writeFileSync(configPath, config);
  writeFileSync(resolve(cluster, "postmaster.pid"), "test fixture");
  const result = spawnSync(
    "/bin/bash",
    [
      "-c",
      `set -euo pipefail
PG_FORMULA=postgresql@17
PG_PORT=6543
brew() { printf '%s\\n' "$TMPDIR"; }
pg_ctl() { return 0; }
pg_isready() { return 0; }
print_success() { :; }
print_exists() { :; }
print_error() { :; }
warn() { :; }
${postgresFunction}
setup_postgres`,
    ],
    { encoding: "utf8", timeout: 10000, env: { NODE_ENV: "test", PATH: "/usr/bin:/bin", TMPDIR: directory } }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(configPath, "utf8")).toBe(config.startsWith("#") ? `${config}\nport = 6543\n` : config);
});

it("installs jq required by the environment selftest", () => {
  const installFunction = /^install_formulas\(\) \{\n[\s\S]*?^\}/m.exec(source)?.[0];
  expect(installFunction).toBeDefined();
  const result = spawnSync(
    "/bin/bash",
    [
      "-c",
      `set -eu
PG_FORMULA=postgresql@17
brew() {
  case "$1" in
    list) test -f "$TMPDIR/$3" ;;
    install) touch "$TMPDIR/$2" ;;
    *) return 1 ;;
  esac
}
print_success() { :; }
print_exists() { :; }
print_error() { :; }
${installFunction}
install_formulas`,
    ],
    { encoding: "utf8", timeout: 10000, env: { NODE_ENV: "test", PATH: "/usr/bin:/bin", TMPDIR: directory } }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(readdirSync(directory)).toContain("jq");
});

it("stops when Homebrew cannot resolve gettext", () => {
  expect(buildFunction).toBeDefined();
  const result = spawnSync(
    "/bin/bash",
    [
      "-c",
      `set -euo pipefail
pg_config() { printf '%s\\n' "$TMPDIR/missing"; }
brew() {
  if [ "$1" = "--prefix" ] && [ "\${2:-}" = "gettext" ]; then return 1; fi
  printf '%s\\n' "$TMPDIR/prefix"
}
git() { return 0; }
cmake() { return 0; }
print_success() { :; }
print_exists() { :; }
warn() { :; }
${buildFunction}
install_h3_extension`,
    ],
    { encoding: "utf8", timeout: 10000, env: { NODE_ENV: "test", PATH: "/usr/bin:/bin", TMPDIR: directory } }
  );
  expect(result.status).toBe(1);
});

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
