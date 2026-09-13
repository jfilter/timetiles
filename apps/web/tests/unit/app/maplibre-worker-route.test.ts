// @vitest-environment node
/**
 * Tests for serving the MapLibre worker files next to each other.
 *
 * @module
 * @category Unit Tests
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GET } from "@/app/maplibre/[file]/route";
import { MAPLIBRE_WORKER_FILES, MAPLIBRE_WORKER_URL } from "@/lib/constants/map";

const require = createRequire(import.meta.url);
const distDir = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist");

const request = (file: string) =>
  GET(new Request(`http://localhost:3000/maplibre/${file}`), { params: Promise.resolve({ file }) });

describe("GET /maplibre/[file]", () => {
  it.each(MAPLIBRE_WORKER_FILES)("serves %s from the installed MapLibre dist as JavaScript", async (file) => {
    const response = await request(file);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^text\/javascript/);
    expect(await response.text()).toBe(readFileSync(path.join(distDir, file), "utf8"));
  });

  it.each(["maplibre-gl.mjs", "../package.json", "%2e%2e%2fpackage.json"])("does not serve %s", async (file) => {
    const response = await request(file);

    expect(response.status).toBe(404);
  });

  it("serves the worker import next to the worker URL", () => {
    const workerSource = readFileSync(path.join(distDir, "maplibre-gl-worker.mjs"), "utf8");
    const imported = [...workerSource.matchAll(/from\s*["'](\.\/[^"']+)["']/g)].map((match) => match[1]);

    expect(imported.length).toBeGreaterThan(0);
    for (const specifier of imported) {
      const resolved = new URL(specifier!, `http://localhost${MAPLIBRE_WORKER_URL}`).pathname;
      expect(MAPLIBRE_WORKER_FILES.map((file) => `/maplibre/${file}`)).toContain(resolved);
    }
  });
});
