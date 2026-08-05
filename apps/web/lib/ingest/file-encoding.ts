/**
 * Detects the byte encoding of an ingest source file and provides a decoded
 * text stream, so non-UTF-8 CSV/text uploads (Windows-1252, ISO-8859-1, etc.)
 * are transcoded instead of silently mangled into U+FFFD.
 *
 * @module
 */
import fs from "node:fs";
import type { Readable } from "node:stream";

import chardet from "chardet";
import iconv from "iconv-lite";

import { logger } from "@/lib/logger";

/** Bytes sampled from the start of the file for charset detection. */
const DETECTION_SAMPLE_BYTES = 65536;

/**
 * Detect the encoding of a file from a leading byte sample.
 * Falls back to utf-8 when detection is inconclusive or unsupported by iconv-lite.
 */
export const detectFileEncoding = (filePath: string): string => {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(DETECTION_SAMPLE_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, DETECTION_SAMPLE_BYTES, 0);
    const sample = buffer.subarray(0, bytesRead);
    const detected = chardet.detect(sample);

    if (detected && iconv.encodingExists(detected)) {
      return detected;
    }
    return "utf-8";
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * Decode an in-memory buffer to a UTF-8 string, detecting its source encoding
 * from a leading sample instead of assuming UTF-8.
 */
export const decodeBufferToUtf8 = (buffer: Buffer): string => {
  const sample = buffer.subarray(0, DETECTION_SAMPLE_BYTES);
  const detected = chardet.detect(sample);
  const encoding = detected && iconv.encodingExists(detected) ? detected : "utf-8";

  if (encoding.toLowerCase() === "utf-8" || encoding.toLowerCase() === "ascii") {
    return buffer.toString("utf-8");
  }

  return iconv.decode(buffer, encoding);
};

/**
 * Open a file as a UTF-8 text stream, transcoding on the fly if the source
 * bytes are in a different detected encoding.
 */
export const createDecodedTextStream = (filePath: string): Readable => {
  const encoding = detectFileEncoding(filePath);
  const rawStream = fs.createReadStream(filePath);

  if (encoding.toLowerCase() === "utf-8" || encoding.toLowerCase() === "ascii") {
    rawStream.setEncoding("utf-8");
    return rawStream;
  }

  logger.info("Transcoding non-UTF-8 ingest file", { filePath, encoding });
  return rawStream.pipe(iconv.decodeStream(encoding)) as unknown as Readable;
};
