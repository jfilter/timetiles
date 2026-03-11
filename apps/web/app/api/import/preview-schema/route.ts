/**
 * API endpoint for reading preview schema data by previewId.
 *
 * GET /api/import/preview-schema?previewId=xxx - Re-parse the preview file
 * and return sheets with headers, sample data, and suggested mappings.
 *
 * Used by the flow editor to load preview data for visual field mapping.
 *
 * @module
 * @category API Routes
 */
import path from "node:path";

import { z } from "zod";

import { apiRoute } from "@/lib/api";

import { loadPreviewMetadata, validateRequest } from "../configure/helpers";
import { parseFileSheets } from "./helpers";

export const GET = apiRoute({
  auth: "required",
  query: z.object({ previewId: z.uuid() }),
  handler: ({ query, user }) => {
    const meta = loadPreviewMetadata(query.previewId);
    const error = validateRequest(meta, user);
    if (error) return error;

    const fileExtension = path.extname(meta!.filePath).toLowerCase();
    const sheets = parseFileSheets(meta!.filePath, fileExtension);

    return Response.json({ sheets });
  },
});
