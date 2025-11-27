/**
 * Hooks for the Branding global.
 *
 * Handles automatic favicon generation when favicon source images change.
 * Uses Sharp for image processing (already configured in Payload).
 *
 * @module
 * @category Globals
 */
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import type { GlobalAfterChangeHook } from "payload";
import sharp from "sharp";

import { logError, logger } from "@/lib/logger";

/**
 * Gets the ID from a media field value (handles both populated and reference).
 * Returns the ID as a string for consistent comparison, or null if not found.
 */
const getMediaId = (field: unknown): string | null => {
  if (!field) {
    return null;
  }
  if (typeof field === "object" && "id" in field) {
    const id = (field as { id: string | number }).id;
    return String(id);
  }
  if (typeof field === "string") {
    return field;
  }
  if (typeof field === "number") {
    return String(field);
  }
  return null;
};

/**
 * Generates favicon files from a source image.
 */
const generateFaviconSet = async (sourceBuffer: Buffer, publicDir: string, suffix: string): Promise<void> => {
  const sizes = [
    { name: `favicon${suffix}.ico`, size: 32 },
    { name: `apple-touch-icon${suffix}.png`, size: 180 },
    { name: `icon-192${suffix}.png`, size: 192 },
    { name: `icon-512${suffix}.png`, size: 512 },
  ];

  await Promise.all(
    sizes.map(({ name, size }) =>
      sharp(sourceBuffer)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(join(publicDir, name))
    )
  );
};

/**
 * Fetches a media file and returns its buffer.
 * Tries to read from local file first (for test environments), then falls back to HTTP.
 */
const fetchMediaBuffer = async (
  payload: Parameters<GlobalAfterChangeHook>[0]["req"]["payload"],
  mediaId: string
): Promise<Buffer | null> => {
  try {
    const media = await payload.findByID({
      collection: "media",
      id: mediaId,
    });

    if (!media?.url) {
      logger.warn({ mediaId }, "Favicon source has no URL");
      return null;
    }

    // Try to read from local file first (works in test environment)
    if (media.filename) {
      // Check the configured upload directory (UPLOAD_DIR/media) first
      const uploadDir = process.env.UPLOAD_DIR;
      if (uploadDir) {
        const uploadPath = join(uploadDir, "media", media.filename);
        if (existsSync(uploadPath)) {
          return readFileSync(uploadPath);
        }
      }

      // Fallback to default public/media path
      const publicPath = join(process.cwd(), "public", "media", media.filename);
      if (existsSync(publicPath)) {
        return readFileSync(publicPath);
      }
    }

    // Fall back to HTTP fetch for production/dev environments
    const url = media.url.startsWith("http") ? media.url : `${process.env.NEXT_PUBLIC_PAYLOAD_URL}${media.url}`;

    const response = await fetch(url);
    if (!response.ok) {
      logger.warn({ url, status: response.status }, "Failed to fetch media file");
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    logError(error, "Failed to fetch media for favicon generation");
    return null;
  }
};

/**
 * Generates favicon files when faviconSourceLight or faviconSourceDark changes.
 *
 * Output files for each theme:
 * - favicon-light.ico / favicon-dark.ico (32x32)
 * - apple-touch-icon.png / apple-touch-icon-dark.png (180x180)
 * - icon-192.png / icon-192-dark.png (192x192)
 * - icon-512.png / icon-512-dark.png (512x512)
 */
// eslint-disable-next-line sonarjs/no-invariant-returns -- Payload hook pattern requires returning doc
export const generateFaviconsHook: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const currentLightId = getMediaId(doc.faviconSourceLight);
  const previousLightId = getMediaId(previousDoc?.faviconSourceLight);
  const currentDarkId = getMediaId(doc.faviconSourceDark);
  const previousDarkId = getMediaId(previousDoc?.faviconSourceDark);

  const lightChanged = currentLightId !== previousLightId;
  const darkChanged = currentDarkId !== previousDarkId;

  if (!lightChanged && !darkChanged) {
    return doc;
  }

  const publicDir = join(process.cwd(), "public");

  // Ensure public directory exists
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }

  try {
    // Generate light theme favicons
    if (lightChanged && currentLightId) {
      const buffer = await fetchMediaBuffer(req.payload, currentLightId);
      if (buffer) {
        await generateFaviconSet(buffer, publicDir, "-light");
        logger.info("Generated light theme favicon files");
      }
    } else if (lightChanged && !currentLightId) {
      logger.info("Light favicon source removed, keeping existing files");
    }

    // Generate dark theme favicons
    if (darkChanged && currentDarkId) {
      const buffer = await fetchMediaBuffer(req.payload, currentDarkId);
      if (buffer) {
        await generateFaviconSet(buffer, publicDir, "-dark");
        logger.info("Generated dark theme favicon files");
      }
    } else if (darkChanged && !currentDarkId) {
      logger.info("Dark favicon source removed, keeping existing files");
    }
  } catch (error) {
    logError(error, "Failed to generate favicons");
  }

  return doc;
};
