// @vitest-environment node
/**
 * Development diagnostics honor database mode without contacting real services.
 * @module
 * @category Tests
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scripts = resolve(import.meta.dirname, "../../../../../scripts");
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "timetiles-diagnostics-"));
  mkdirSync(resolve(directory, "apps/web"), { recursive: true });
  mkdirSync(resolve(directory, "node_modules"));
  writeFileSync(resolve(directory, ".env"), "");
  writeFileSync(resolve(directory, "apps/web/.env.local"), "");
  for (const command of ["head", "cut", "tr"]) symlinkSync(`/usr/bin/${command}`, resolve(directory, command));
  symlinkSync("/bin/bash", resolve(directory, "bash"));
  for (const command of ["git", "git-lfs", "make", "node", "pnpm", "jq", "curl", "psql", "pg_isready"]) {
    writeFileSync(resolve(directory, command), "#!/bin/sh\nprintf '24.14.0\\n'\n", { mode: 0o755 });
  }
  writeFileSync(resolve(directory, "pgrep"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

const run = (script: string, mode: string) =>
  spawnSync("/bin/bash", [resolve(scripts, script)], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10000,
    env: { NODE_ENV: "test", PATH: directory, PG_MODE: mode, PG_PORT: "6543" },
  });

describe("environment diagnostics", () => {
  it("accepts a local setup without Docker", () => {
    const result = run("selftest.sh", "local");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Environment ready");
    expect(result.stdout).not.toContain("docker not found");
  });

  it("still requires Docker in Docker mode", () => {
    const result = run("selftest.sh", "docker");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("docker not found");
  });

  it.each(["psql", "pg_isready"])("reports missing %s", (command) => {
    rmSync(resolve(directory, command));
    const result = run("selftest.sh", "local");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${command} not found`);
  });

  it("reports local PostgreSQL readiness on the configured port", () => {
    const result = run("status.sh", "local");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PostgreSQL is ready on port 6543");
    expect(result.stdout).not.toContain("Docker Infrastructure");
  });
});
