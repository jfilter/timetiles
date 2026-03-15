/**
 * API endpoint for validating a preview file exists.
 *
 * GET /api/import/validate-preview?previewId=xxx - Check if preview file exists
 *
 * Used by the wizard to validate restored localStorage state.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { apiRoute } from "@/lib/api";

const getPreviewDir = (): string => {
  return path.join(os.tmpdir(), "timetiles-wizard-preview");
};

export const GET = apiRoute({
  auth: "required",
  query: z.object({ previewId: z.uuid() }),
  handler: ({ query }) => {
    const previewDir = getPreviewDir();
    const metaPath = path.join(previewDir, `${query.previewId}.meta.json`);

    if (!fs.existsSync(metaPath)) {
      return { valid: false };
    }

    try {
      const content = fs.readFileSync(metaPath, "utf-8");
      const meta = JSON.parse(content);

      if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) {
        return { valid: false };
      }

      if (!meta.filePath || !fs.existsSync(meta.filePath)) {
        return { valid: false };
      }

      return { valid: true };
    } catch {
      return { valid: false };
    }
  },
});
