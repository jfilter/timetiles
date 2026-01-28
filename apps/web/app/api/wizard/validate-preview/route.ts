/**
 * API endpoint for validating a preview file exists.
 *
 * GET /api/wizard/validate-preview?previewId=xxx - Check if preview file exists
 *
 * Used by the wizard to validate restored localStorage state.
 *
 * @module
 * @category API Routes
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = (id: string): boolean => UUID_REGEX.test(id);

const getPreviewDir = (): string => {
  return path.join(os.tmpdir(), "timetiles-wizard-preview");
};

/**
 * Validate that a preview file exists.
 */
export const GET = (req: NextRequest) => {
  const previewId = req.nextUrl.searchParams.get("previewId");

  if (!previewId || !isValidUUID(previewId)) {
    return NextResponse.json({ valid: false });
  }

  const previewDir = getPreviewDir();
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);

  // Check if metadata file exists
  if (!fs.existsSync(metaPath)) {
    return NextResponse.json({ valid: false });
  }

  // Check if metadata is valid and not expired
  try {
    const content = fs.readFileSync(metaPath, "utf-8");
    const meta = JSON.parse(content);

    // Check expiry
    if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) {
      return NextResponse.json({ valid: false });
    }

    // Check if actual file exists
    if (!meta.filePath || !fs.existsSync(meta.filePath)) {
      return NextResponse.json({ valid: false });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false });
  }
};
