/**
 * API endpoint for validating a preview file exists.
 *
 * GET /api/ingest/validate-preview?previewId=xxx - Check if preview file exists
 *
 * Used by the wizard to validate restored localStorage state.
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { loadPreviewMetadata } from "@/lib/ingest/preview-store";
import { validateRequest } from "@/lib/ingest/preview-validation";

export const GET = apiRoute({
  auth: "required",
  site: "default",
  query: z.object({ previewId: z.uuid() }),
  handler: ({ query, user }) => {
    const previewMeta = loadPreviewMetadata(query.previewId);
    try {
      validateRequest(previewMeta, user);
    } catch {
      return { valid: false };
    }
    return { valid: true };
  },
});
