/**
 * Download handler for the ingest-files upload collection.
 *
 * Canonical ingest CSVs are stored RAW on disk because the pipeline re-parses
 * them into events and a leading apostrophe would corrupt real values (see the
 * note in `lib/ingest/json-to-csv.ts`). That raw file, however, stays reachable
 * by owners/editors/admins through the Payload upload URL — opening it in a
 * spreadsheet would execute any `=`/`+`/`-`/`@` cell as a formula (CWE-1236).
 *
 * This upload handler runs AFTER Payload's file access check and escapes CSV
 * cells at serve time, so the download is spreadsheet-safe while the stored data
 * the pipeline reads remains untouched. Non-CSV files (xlsx/ods, size variants)
 * fall through to Payload's default serving.
 *
 * @module
 * @category Collections
 */
import fsPromises from "node:fs/promises";

import type { PayloadRequest, TypeWithID, UploadConfig } from "payload";

import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { logger } from "@/lib/logger";
import { escapeCsvFormulasInText } from "@/lib/utils/csv-escape";

type IngestFileDoc = TypeWithID & { mimeType?: string | null; filename?: string | null; originalName?: string | null };

type UploadFileHandler = NonNullable<UploadConfig["handlers"]>[number];
type UploadFileHandlerArgs = Parameters<UploadFileHandler>[1];

const isCsvFile = (doc: IngestFileDoc, filename: string): boolean =>
  doc.mimeType === "text/csv" || filename.toLowerCase().endsWith(".csv");

/** Strip characters that could break out of the Content-Disposition filename. */
const sanitizeDownloadName = (name: string): string => name.replace(/[\r\n"\\]/g, "_");

// Payload types a file handler's return as `Promise<Response> | Promise<void>`
// (not `Promise<Response | void>`), so a single async function returning either
// is not directly assignable. Author it with a precise return, then adapt.
const handleIngestFileDownload = async (
  _req: PayloadRequest,
  args: UploadFileHandlerArgs
): Promise<Response | undefined> => {
  const { filename, prefix } = args.params;
  // Size variants / prefixed reads don't apply to CSVs — let Payload handle them.
  if (prefix) return undefined;

  const doc = args.doc as IngestFileDoc;
  if (!isCsvFile(doc, filename)) return undefined;

  let raw: string;
  try {
    raw = await fsPromises.readFile(getIngestFilePath(filename), "utf-8");
  } catch (error) {
    // Missing/unreadable file → fall through so Payload's default handler emits
    // its standard not-found response instead of us masking it.
    logger.warn({ filename, error }, "ingest-files download: could not read CSV for escaping");
    return undefined;
  }

  const escaped = escapeCsvFormulasInText(raw);
  const downloadName = sanitizeDownloadName(doc.originalName ?? filename);

  return new Response(escaped, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Content-Length": String(Buffer.byteLength(escaped, "utf-8")),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
};

export const ingestFileDownloadHandler = handleIngestFileDownload as UploadFileHandler;
