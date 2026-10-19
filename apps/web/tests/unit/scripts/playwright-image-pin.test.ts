// @vitest-environment node
/**
 * Regression test for the Playwright container image used by the E2E workflow.
 *
 * The image bakes in browser builds for one Playwright release; a different
 * `@playwright/test` version cannot launch them.
 *
 * @module
 * @category Unit Tests
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const WORKFLOW = ".github/workflows/test-e2e.yml";
const read = (relativePath: string) => readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");

/** `@playwright/test` version locked for the apps/web importer (CI installs from the lockfile). */
const lockedPlaywright = (): string | undefined => {
  const lines = read("pnpm-lock.yaml").split("\n");
  const importer = lines.indexOf("  apps/web:");
  const nextImporter = lines.findIndex((line, index) => index > importer && /^ {2}\S/.test(line));
  const entry = lines.indexOf("      '@playwright/test':", importer);
  if (importer === -1 || entry === -1 || (nextImporter !== -1 && entry > nextImporter)) return undefined;
  return /^\s+version: ([^\s(]+)/.exec(lines[entry + 2] ?? "")?.[1];
};

describe(WORKFLOW, () => {
  it("runs in the Playwright image matching the locked @playwright/test", () => {
    const locked = lockedPlaywright();
    expect(locked, "@playwright/test in pnpm-lock.yaml").toBeDefined();

    const images = read(WORKFLOW)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("image: mcr.microsoft.com/playwright:"));

    expect(images).toEqual([`image: mcr.microsoft.com/playwright:v${locked}-noble`]);
  });
});
