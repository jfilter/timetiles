// @vitest-environment node
/**
 * Regression tests for building the web app's workspace dependencies.
 *
 * The web app imports workspace packages whose exports point at `dist/`. Images
 * or CI jobs that build only some of them fail with ERR_MODULE_NOT_FOUND as soon
 * as `payload` or `next` loads the web code, so every web dependency must be built.
 *
 * @module
 * @category Unit Tests
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const BUILD_WEB_DEPENDENCIES = "pnpm exec turbo run build --filter=web^...";

const readRepoFile = (relativePath: string) => readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");

describe.each(["deployment/Dockerfile.prod", "deployment/Dockerfile.allinone"])("%s", (file) => {
  const dockerfile = readRepoFile(file);

  it("builds all web workspace dependencies before generating the import map", () => {
    const dependencyBuild = dockerfile.indexOf(`RUN ${BUILD_WEB_DEPENDENCIES}`);
    const importMap = dockerfile.indexOf("payload generate:importmap");

    expect(dependencyBuild).toBeGreaterThan(-1);
    expect(importMap).toBeGreaterThan(dependencyBuild);
  });

  it("does not build workspace packages one by one", () => {
    expect(dockerfile).not.toMatch(/WORKDIR \S+\/packages\/[\w-]+\s+RUN pnpm build/);
  });
});

describe("CI setup action", () => {
  const action = readRepoFile(".github/actions/setup/action.yml");

  it("builds all web workspace dependencies right after installing", () => {
    const install = action.indexOf("run: pnpm install --frozen-lockfile");
    const dependencyBuild = action.indexOf(`run: ${BUILD_WEB_DEPENDENCIES}`);

    expect(install).toBeGreaterThan(-1);
    expect(dependencyBuild).toBeGreaterThan(install);
  });
});
