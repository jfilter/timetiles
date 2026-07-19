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
 * the pipeline reads remains untouched. Escaping is delimiter-agnostic and runs
 * as a streaming BYTE scan (latin1, so any single-byte source encoding —
 * Windows-1252, etc. — is preserved exactly rather than mangled through a UTF-8
 * decode; O(1) memory, independent of file/record size). Non-CSV files (xlsx/ods,
 * size variants) fall through to Payload's default serving.
 *
 * Scope: the scan neutralizes ASCII formula triggers (`= + - @`) at any field
 * boundary for UTF-8 / ASCII / single-byte-encoded CSVs — the realistic threat.
 * Two exotic classes are NOT covered and are an accepted residual: a CSV stored
 * in a WIDE encoding (UTF-16/UTF-32, i.e. carrying a `FF FE` / `FE FF` / 4-byte
 * BOM) whose formula bytes are multi-byte, and full-width trigger glyphs
 * (`＝＋－＠`) that only some locales evaluate. Both would require an
 * encoding-aware (multi-byte) scanner; ingest CSVs are effectively always UTF-8.
 *
 * @module
 * @category Collections
 */
import { createReadStream } from "node:fs";
import fsPromises from "node:fs/promises";
import { pipeline, Readable, Transform } from "node:stream";

import type { PayloadRequest, TypeWithID, UploadConfig } from "payload";

import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { logger } from "@/lib/logger";
import { detectSepDirective, escapeCsvFormulaBoundaries, neutralizeSylkMagic, UTF8_BOM } from "@/lib/utils/csv-escape";

type IngestFileDoc = TypeWithID & { mimeType?: string | null; filename?: string | null; originalName?: string | null };

type UploadFileHandler = NonNullable<UploadConfig["handlers"]>[number];
type UploadFileHandlerArgs = Parameters<UploadFileHandler>[1];

// `doc` can be undefined: for privileged (editor/admin) readers `access.read`
// returns `true`, so Payload's checkFileAccess skips the record fetch and passes
// no doc. Decide on the filename extension in that case (never dereference doc).
const isCsvFile = (doc: IngestFileDoc | undefined, filename: string): boolean =>
  doc?.mimeType === "text/csv" || filename.toLowerCase().endsWith(".csv");

/** Percent-encode per RFC 5987 (encodeURIComponent leaves `'()*` which the grammar forbids). */
const rfc5987Encode = (value: string): string =>
  encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Build an injection-safe, encoding-safe Content-Disposition. A non-latin
 * `originalName` (e.g. `日本語.csv`) cannot be placed in a raw header (Response
 * requires a ByteString → throws 500), so emit an ASCII-only `filename` fallback
 * plus an RFC 5987 `filename*=UTF-8''…` with the full name percent-encoded (which
 * also neutralizes CR/LF/quote injection).
 */
const buildContentDisposition = (name: string): string => {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encode(name)}`;
};

/**
 * Stream the CSV through a delimiter-agnostic formula-escaping transform. The
 * escape is a pure character scan with a two-char carry across chunks (see
 * {@link escapeCsvFormulaBoundaries}), so memory stays O(1) regardless of file or
 * record size. `stream.pipeline` tears down the file read stream if the client
 * cancels the download or an error occurs, so no descriptor leaks.
 */
const createEscapedCsvStream = (filePath: string): ReadableStream<Uint8Array> => {
  // latin1 = byte-per-char, so non-UTF-8 source bytes survive the round-trip.
  const source = createReadStream(filePath, "latin1");
  let carry = "";
  // An Excel `sep=<char>` directive on the first line declares an arbitrary
  // delimiter; capture it once and treat it as a boundary for the whole file.
  let extraDelimiter: string | undefined;
  let firstChunk = true;
  const escaper = new Transform({
    decodeStrings: false,
    transform: (chunk: unknown, _enc, done) => {
      let text = typeof chunk === "string" ? chunk : String(chunk);
      let bomPrefix = "";
      if (firstChunk) {
        // Strip a leading BOM, scan the body (so a `<BOM>=formula` is a
        // file-start trigger), then re-prepend the BOM bytes unchanged.
        if (text.startsWith(UTF8_BOM)) {
          bomPrefix = UTF8_BOM;
          text = text.slice(UTF8_BOM.length);
        }
        extraDelimiter = detectSepDirective(text);
        text = neutralizeSylkMagic(text);
        firstChunk = false;
      }
      const result = escapeCsvFormulaBoundaries(text, carry, extraDelimiter);
      carry = result.carry;
      done(null, Buffer.from(bomPrefix + result.output, "latin1"));
    },
  });
  pipeline(source, escaper, (error) => {
    if (error) logger.warn({ error }, "ingest-files download: stream error while escaping CSV");
  });
  return Readable.toWeb(escaper) as ReadableStream<Uint8Array>;
};

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

  const doc = args.doc as IngestFileDoc | undefined;
  if (!isCsvFile(doc, filename)) return undefined;

  const filePath = getIngestFilePath(filename);
  try {
    await fsPromises.stat(filePath);
  } catch {
    // Missing/unreadable file → fall through so Payload's default handler emits
    // its standard not-found response instead of us masking it.
    logger.warn({ filename }, "ingest-files download: CSV not found for escaping");
    return undefined;
  }

  return new Response(createEscapedCsvStream(filePath), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": buildContentDisposition(doc?.originalName ?? filename),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
};

export const ingestFileDownloadHandler = handleIngestFileDownload as UploadFileHandler;
