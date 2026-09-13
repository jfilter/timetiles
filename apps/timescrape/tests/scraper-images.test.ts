/**
 * Guards that the scraper runtime images ship the SDKs from this repository.
 *
 * Installing the SDK from PyPI or npm shipped releases that predated fixes in
 * packages/python and packages/scraper, so every build path must use the
 * repository root as context and copy the workspace sources.
 *
 * @module
 * @category Tests
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const readLines = (relativePath: string) => readFileSync(path.join(REPO_ROOT, relativePath), "utf-8").split("\n");

/** Lines indented deeper than `header`, up to the next line at or above its level. */
const indentedBlock = (lines: string[], header: string): string[] => {
  const start = lines.indexOf(header);
  if (start === -1) return [];
  const depth = header.length - header.trimStart().length;
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() !== "" && line.length - line.trimStart().length <= depth
  );
  return lines.slice(start + 1, end === -1 ? lines.length : end);
};

const IMAGES = [
  { runtime: "python", sdkDir: "packages/python", registryInstall: /\btimetiles[=<>~]=/ },
  { runtime: "node", sdkDir: "packages/scraper", registryInstall: /@timetiles\/scraper@/ },
] as const;

describe.each(IMAGES)("$runtime scraper image", ({ runtime, sdkDir, registryInstall }) => {
  const imageDir = `apps/timescrape/images/${runtime}`;
  const dockerfile = readLines(`${imageDir}/Dockerfile`).join("\n");

  it("does not install the SDK from a package registry", () => {
    expect(dockerfile).not.toMatch(registryInstall);
  });

  it("installs the SDK from the workspace sources", () => {
    expect(dockerfile).toContain(sdkDir);
    expect(readLines(`${imageDir}/Dockerfile.dockerignore`)).toContain(`!${sdkDir}/src`);
  });

  it("is built from the repository root in CI", () => {
    const job = indentedBlock(readLines(".github/workflows/release-images.yml"), `  build-scraper-${runtime}:`);

    expect(job.map((line) => line.trim())).toContain(`dockerfile: ${imageDir}/Dockerfile`);
    expect(job.some((line) => line.trim().startsWith("context:"))).toBe(false);
  });

  it.each(["Makefile", "deployment/timetiles", "deployment/bootstrap/steps/13-scraper-setup.sh"])(
    "is built with the SDK-aware ignore file in %s",
    (file) => {
      const lines = readLines(file);
      const script = lines.join("\n");

      expect(lines.some((line) => /images\/\w+\/"?$/.test(line.trimEnd()))).toBe(false);
      expect(script).toContain("--ignorefile");
      expect(script).toContain("Dockerfile.dockerignore");
    }
  );
});

describe("node scraper image SDK build", () => {
  it("pins the build tools to the versions locked for packages/scraper", () => {
    const dockerfile = readLines("apps/timescrape/images/node/Dockerfile").join("\n");
    const importer = indentedBlock(readLines("pnpm-lock.yaml"), "  packages/scraper:");

    for (const tool of ["tsup", "typescript", "@types/node"]) {
      const key = tool.startsWith("@") ? `'${tool}'` : tool;
      const locked = indentedBlock(importer, `      ${key}:`)
        .map((line) => line.trim())
        .find((line) => line.startsWith("version: "))
        ?.slice("version: ".length)
        .split("(")[0];

      expect(locked, `${tool} in pnpm-lock.yaml`).toBeDefined();
      expect(dockerfile).toContain(`${tool}@${locked}`);
    }
  });
});
