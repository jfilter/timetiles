// @vitest-environment node
/**
 * The root oxlint config must apply path-scoped rules and resolve `@/` aliases
 * for the boundaries plugin from the workspace root and from a package.
 *
 * @module
 * @category Tests
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localBin, WORKSPACE_ROOT } from "../../../../../scripts/shared/local-bin";

const WEB_ROOT = path.join(WORKSPACE_ROOT, "apps", "web");
const PROBE_DIR = path.join(WEB_ROOT, "lib", "services", `oxlint-probe-${process.pid}`);
const HEADER = "/**\n * Probe.\n *\n * @module\n */\n";

interface Diagnostic {
  code: string;
  labels: Array<{ span: { line: number } }>;
}

const writeProbe = (name: string, body: string): string => {
  const file = path.join(PROBE_DIR, name);
  writeFileSync(file, HEADER + body);
  return file;
};

/** Lint one file with the root config, from `cwd`, and return diagnostics of one rule. */
const lint = (file: string, cwd: string, code: string): Diagnostic[] => {
  const result = spawnSync(
    localBin("oxlint", WORKSPACE_ROOT),
    ["--config", path.join(WORKSPACE_ROOT, ".oxlintrc.json"), "--format", "json", path.relative(cwd, file)],
    { cwd, encoding: "utf8", timeout: 30000 }
  );
  expect(result.error).toBeUndefined();
  const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };
  return diagnostics.filter((d) => d.code === code);
};

describe("root oxlint config", () => {
  beforeAll(() => mkdirSync(PROBE_DIR, { recursive: true }));
  afterAll(() => rmSync(PROBE_DIR, { recursive: true, force: true }));

  it("distinguishes static SQL from interpolation in services", () => {
    const file = writeProbe(
      "sql.ts",
      [
        'import { sql } from "@payloadcms/db-postgres";',
        'export const a = sql.raw("SELECT 1");',
        "export const b = sql.raw(`SELECT 1`);",
        "export const c = sql.raw(`SELECT ${String(a)}`);",
        'export const d = sql.raw("SELECT " + String(b));',
        "",
      ].join("\n")
    );
    const lines = lint(file, WORKSPACE_ROOT, "core(no-restricted-syntax)").map((d) => d.labels[0]?.span.line);
    expect(lines.toSorted((x = 0, y = 0) => x - y)).toEqual([9, 10]);
  }, 60000);

  it.each([
    ["the workspace root", WORKSPACE_ROOT],
    ["the web package", WEB_ROOT],
  ])(
    "rejects a services import of components through the @/ alias from %s",
    (_label, cwd) => {
      const file = writeProbe(
        "boundaries.ts",
        'import { BlockRenderer } from "@/components/block-renderer";\nexport const probe = BlockRenderer;\n'
      );
      expect(lint(file, cwd, "boundaries(dependencies)")).toHaveLength(1);
    },
    60000
  );
});
