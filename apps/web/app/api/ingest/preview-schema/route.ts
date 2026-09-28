/**
 * API endpoint for reading preview schema data by previewId.
 *
 * GET /api/ingest/preview-schema?previewId=xxx - Re-parse the preview file
 * and return sheets with headers, sample data, and suggested mappings.
 *
 * Used by the flow editor to load preview data for visual field mapping.
 *
 * @module
 * @category API Routes
 */

import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { loadPreviewMetadata } from "@/lib/ingest/preview-store";
import { validateRequest } from "@/lib/ingest/preview-validation";

import { parseFileSheets } from "./helpers";

export const GET = apiRoute({
  auth: "required",
  site: "default",
  query: z.object({ previewId: z.uuid() }),
  handler: async ({ query, user }) => {
    const meta = loadPreviewMetadata(query.previewId);
    validateRequest(meta, user);

    const sheets = await parseFileSheets(meta.filePath);

    return { sheets };
  },
});
