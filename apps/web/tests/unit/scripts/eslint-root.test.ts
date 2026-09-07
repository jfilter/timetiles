// @vitest-environment node
/**
 * Root ESLint execution must preserve package rules and resolve pnpm catalogs.
 *
 * @module
 * @category Tests
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const runLint = (args: string[]) => {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30000,
    // The test runner suppresses Node warnings; these CLI tests must observe them.
    env: { ...process.env, NODE_OPTIONS: "", NODE_NO_WARNINGS: "" },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr + result.stdout).toBe(0);
  return result;
};

describe.sequential("root ESLint invocation", () => {
  it("loads the shared root configuration as explicit ESM", () => {
    const result = runLint(["--silent", "-w", "lint:eslint", "--print-config", "packages/eslint-config/base.js"]);
    expect(result.stderr).not.toContain("MODULE_TYPELESS_PACKAGE_JSON");
    const config = JSON.parse(result.stdout) as { rules: Record<string, unknown> };
    // The shared Oxlint bridge disables the duplicate ESLint rule.
    expect(config.rules["import/no-self-import"]).toEqual([0]);
  }, 60000);

  it("preserves the Web API's package-specific rules", () => {
    const file = "app/api/data-exports/[id]/download/route.ts";
    const local = runLint(["exec", "eslint", "--print-config", file]);
    const root = runLint(["--silent", "-w", "lint:eslint", "--print-config", `apps/web/${file}`]);
    const localConfig = JSON.parse(local.stdout) as { rules: Record<string, unknown> };
    const rootConfig = JSON.parse(root.stdout) as { rules: Record<string, unknown> };
    expect(rootConfig.rules).toEqual(localConfig.rules);
  }, 60000);

  it("resolves catalog dependencies and the Oxlint bridge from the root", () => {
    const file = "apps/web/lib/utils/is-enoent.ts";
    const result = runLint(["--silent", "-w", "lint:eslint", file, "--no-cache", "--format", "json"]);
    const output = result.stdout + result.stderr;
    expect(output).not.toContain("could not be resolved for catalog");
    expect(output).not.toContain("could not find oxlint config file");
    expect(output).not.toContain("Pages directory cannot be found");
    const report = JSON.parse(result.stdout) as Array<{ filePath: string; errorCount: number }>;
    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({ filePath: path.resolve("../..", file), errorCount: 0 });
  }, 60000);
});
