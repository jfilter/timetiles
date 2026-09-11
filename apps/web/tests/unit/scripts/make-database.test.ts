// @vitest-environment node
/**
 * Verify database command failure handling without contacting PostgreSQL or Docker.
 *
 * @module
 * @category Tests
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const makefile = resolve(import.meta.dirname, "../../../../..", "Makefile");
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "timetiles-make-database-"));
  for (const command of ["psql", "docker"]) {
    writeFileSync(
      resolve(directory, command),
      `#!/bin/sh
input=""
case "$*" in
  *ON_ERROR_STOP*) while IFS= read -r line; do input="$input$line"; done ;;
esac
printf 'call:%s\\n' "$*"
printf 'input:%s\\n' "$input"
case "$*$input" in
  *"$FAIL_PATTERN"*) printf 'simulated command failure\\n' >&2; exit 42 ;;
esac
exit 0
`,
      { mode: 0o755 }
    );
  }
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const runMake = (target: string, mode: string, failure = "__never__") =>
  spawnSync("/usr/bin/make", ["--no-print-directory", "-f", makefile, target, `PG_MODE=${mode}`, "SHELL=/bin/bash"], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10000,
    // Only the two command stubs are on PATH; no real Docker or psql is reachable.
    env: { NODE_ENV: "test", PATH: directory, FAIL_PATTERN: failure },
  });

describe("development database commands", () => {
  it.each(["local", "docker"])("db-reset-tests stops on SQL errors in %s mode", (mode) => {
    const result = runMake("db-reset-tests", mode, "DROP DATABASE");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("simulated command failure");
    expect(result.stdout).not.toContain("Recreating E2E");
    expect(result.stdout).toContain("format('DROP DATABASE %I', datname)");
    expect(result.stdout).toContain("datname ~ '^timetiles_test_'");
    expect(result.stdout).toContain("\\gexec");
    expect(result.stdout).toContain("-X -v ON_ERROR_STOP=1");
    if (mode === "docker") expect(result.stdout).toContain("exec -i timetiles-postgres");
  });

  it.each(["local", "docker"])("clean succeeds in %s mode", (mode) => {
    const result = runMake("clean", mode);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("prune");
  });

  it.each(["local", "docker"])("clean reports errors in %s mode", (mode) => {
    const result = runMake("clean", mode, mode === "local" ? "DROP DATABASE" : "down");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("simulated command failure");
  });

  it.each(["local", "docker"])("db-reset stops after deletion fails in %s mode", (mode) => {
    const result = runMake("db-reset", mode, mode === "local" ? "DROP DATABASE" : "down");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("simulated command failure");
    expect(result.stdout).not.toContain("CREATE DATABASE");
    expect(result.stdout).not.toContain("up -d");
    expect(result.stdout).not.toContain("Database reset complete");
  });

  it.each([
    ["CREATE DATABASE", "CREATE SCHEMA"],
    ["CREATE SCHEMA", "CREATE EXTENSION"],
  ])("fresh stops when %s fails", (failure, nextCommand) => {
    const result = runMake("fresh", "local", failure);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("simulated command failure");
    expect(result.stdout).not.toContain(nextCommand);
    expect(result.stdout).not.toContain("Running migrations");
  });
});
