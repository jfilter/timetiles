/**
 * Tests that every `@timetiles/ui/<subpath>` imported by the apps is a published export with a build entry.
 *
 * @module
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import tsupConfig from "../../tsup.config";

const uiRoot = path.resolve(import.meta.dirname, "../..");
const appsRoot = path.resolve(uiRoot, "../../apps");
const skippedDirs = new Set(["node_modules", ".next", "dist", "coverage", "storybook-static"]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return skippedDirs.has(entry.name) ? [] : sourceFiles(path.join(dir, entry.name));
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [path.join(dir, entry.name)] : [];
  });

const importedSubpaths = (): Map<string, string> => {
  const found = new Map<string, string>();
  for (const file of sourceFiles(appsRoot)) {
    for (const { fileName } of ts.preProcessFile(readFileSync(file, "utf-8"), true, true).importedFiles) {
      if (fileName.startsWith("@timetiles/ui/")) found.set(`./${fileName.slice("@timetiles/ui/".length)}`, file);
    }
  }
  return found;
};

const packageJson = JSON.parse(readFileSync(path.join(uiRoot, "package.json"), "utf-8")) as {
  exports: Record<string, string | { source: string; import: { default: string } }>;
};

describe("package exports", () => {
  it("covers every @timetiles/ui subpath imported by the apps", () => {
    const subpaths = importedSubpaths();
    expect(subpaths.size).toBeGreaterThan(0);

    const missing = [...subpaths].filter(([subpath]) => !(subpath in packageJson.exports));
    expect(missing).toEqual([]);
  });

  it("has a tsup entry for every compiled export", () => {
    const builds = Array.isArray(tsupConfig) ? tsupConfig : [tsupConfig];
    const entries = new Map(
      builds.flatMap((build) => Object.entries((build as { entry: Record<string, string> }).entry))
    );

    const missing = Object.values(packageJson.exports)
      .filter((target) => typeof target === "object")
      .filter(({ source, import: { default: output } }) => {
        const key = output.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
        return path.normalize(entries.get(key) ?? "") !== path.normalize(source);
      })
      .map(({ source }) => source);
    expect(missing).toEqual([]);
  });
});
