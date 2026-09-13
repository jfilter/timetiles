/**
 * Serves the MapLibre web worker and the shared chunk it imports.
 *
 * Bundling rewrites MapLibre's `import.meta.url`, so its derived worker URL is empty; the
 * worker and its relative `./maplibre-gl-shared.mjs` import are served side by side here.
 *
 * @module
 * @category API
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { MAPLIBRE_WORKER_FILES } from "@/lib/constants/map";

// The server bundle turns require.resolve into a module id, so resolve from the app root like Next does.
const MAPLIBRE_DIST_DIR = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");

const isWorkerFile = (file: string): file is (typeof MAPLIBRE_WORKER_FILES)[number] =>
  (MAPLIBRE_WORKER_FILES as readonly string[]).includes(file);

export const GET = async (_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> => {
  const { file } = await params;
  if (!isWorkerFile(file)) return new Response("Not found", { status: 404 });

  const source = await readFile(path.join(MAPLIBRE_DIST_DIR, file));
  return new Response(new Uint8Array(source), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
