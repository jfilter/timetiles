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
 * the pipeline reads remains untouched. Escaping streams row-by-row (bounded
 * memory even for a large upload). Non-CSV files (xlsx/ods, size variants) fall
 * through to Payload's default serving.
 *
 * @module
 * @category Collections
 */
import { createReadStream } from "node:fs";
import fsPromises from "node:fs/promises";
import { Readable, Transform } from "node:stream";

import Papa from "papaparse";
import type { PayloadRequest, TypeWithID, UploadConfig } from "payload";

import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { logger } from "@/lib/logger";
import { detectDelimiter, escapeCsvFormula } from "@/lib/utils/csv-escape";

type IngestFileDoc = TypeWithID & { mimeType?: string | null; filename?: string | null; originalName?: string | null };

type UploadFileHandler = NonNullable<UploadConfig["handlers"]>[number];
type UploadFileHandlerArgs = Parameters<UploadFileHandler>[1];

/** Bytes read from the file head to sniff the CSV delimiter and line break. */
const HEAD_SAMPLE_BYTES = 64 * 1024;

// `doc` can be undefined: for privileged (editor/admin) readers `access.read`
// returns `true`, so Payload's checkFileAccess skips the record fetch and passes
// no doc. Decide on the filename extension in that case (never dereference doc).
const isCsvFile = (doc: IngestFileDoc | undefined, filename: string): boolean =>
  doc?.mimeType === "text/csv" || filename.toLowerCase().endsWith(".csv");

/**
 * Build an injection-safe, encoding-safe Content-Disposition. A non-latin
 * `originalName` (e.g. `日本語.csv`) cannot be placed in a raw header (Response
 * requires a ByteString → throws 500), so emit an ASCII-only `filename` fallback
 * plus an RFC 5987 `filename*=UTF-8''…` with the full name percent-encoded (which
 * also neutralizes CR/LF/quote injection).
 */
const buildContentDisposition = (name: string): string => {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/** Read the file head to sniff the delimiter; returns null when unreadable. */
const readHeadSample = async (filePath: string): Promise<string | null> => {
  let handle: fsPromises.FileHandle | undefined;
  try {
    handle = await fsPromises.open(filePath, "r");
    const buffer = Buffer.alloc(HEAD_SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_SAMPLE_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf-8");
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
};

/**
 * Stream the CSV through a formula-escaping transform. Papa's streaming parser
 * yields one fully-parsed row at a time (correctly handling quoted embedded
 * newlines), each row is escaped and re-serialized, and Node's pipe chain +
 * `Readable.toWeb` carry the backpressure — so the whole file never materializes
 * in memory at once.
 */
const createEscapedCsvStream = (filePath: string, delimiter: string, newline: string): ReadableStream<Uint8Array> => {
  const source = createReadStream(filePath, "utf-8");
  const parser = Papa.parse(Papa.NODE_STREAM_INPUT, { delimiter });
  const escaper = new Transform({
    writableObjectMode: true,
    // Arrow (no `this` use): Papa emits one parsed row array per chunk; escape
    // its cells and re-serialize a single line with the detected delimiter.
    transform: (row: unknown, _enc, done) => {
      const cells = Array.isArray(row) ? (row as unknown[]).map((cell) => escapeCsvFormula(cell)) : [row];
      done(null, `${Papa.unparse([cells], { delimiter })}${newline}`);
    },
  });
  // `.pipe()` does not forward errors, so surface upstream failures onto the tail
  // stream, which becomes the web stream's error.
  source.on("error", (error) => escaper.destroy(error));
  parser.on("error", (error: Error) => escaper.destroy(error));

  return Readable.toWeb(source.pipe(parser).pipe(escaper)) as ReadableStream<Uint8Array>;
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
  const sample = await readHeadSample(filePath);
  if (sample === null) {
    // Missing/unreadable file → fall through so Payload's default handler emits
    // its standard not-found response instead of us masking it.
    logger.warn({ filename }, "ingest-files download: could not read CSV for escaping");
    return undefined;
  }

  const delimiter = detectDelimiter(sample);
  const newline = sample.includes("\r\n") ? "\r\n" : "\n";

  return new Response(createEscapedCsvStream(filePath, delimiter, newline), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": buildContentDisposition(doc?.originalName ?? filename),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
};

export const ingestFileDownloadHandler = handleIngestFileDownload as UploadFileHandler;
