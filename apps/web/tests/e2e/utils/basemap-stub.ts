/**
 * Answers the basemap host the bundled map styles reference, so E2E runs do not depend on it.
 *
 * Tiles come back empty, sprites as an empty atlas and glyph ranges as an empty font, which
 * MapLibre renders as a blank basemap. Event layers come from the app and are unaffected.
 *
 * @module
 * @category E2E Utils
 */
import type { BrowserContext, Route } from "@playwright/test";

export const BASEMAP_HOST_PATTERN = "https://tiles.versatiles.org/**";

const TRANSPARENT_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

const CORS = { "access-control-allow-origin": "*" };

const answerBasemapRequest = async (route: Route) => {
  const { pathname } = new URL(route.request().url());
  if (pathname.startsWith("/assets/sprites/") && pathname.endsWith(".json")) {
    return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: "{}" });
  }
  if (pathname.startsWith("/assets/sprites/") && pathname.endsWith(".png")) {
    return route.fulfill({ status: 200, headers: CORS, contentType: "image/png", body: TRANSPARENT_PIXEL_PNG });
  }
  if (pathname.startsWith("/assets/glyphs/") || pathname.startsWith("/tiles/")) {
    return route.fulfill({ status: 200, headers: CORS, contentType: "application/x-protobuf", body: Buffer.alloc(0) });
  }
  return route.fulfill({ status: 404, headers: CORS, body: "" });
};

export const stubBasemap = (context: BrowserContext) => context.route(BASEMAP_HOST_PATTERN, answerBasemapRequest);
