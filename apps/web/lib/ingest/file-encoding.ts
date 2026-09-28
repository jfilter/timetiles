/**
 * Detects the byte encoding of an ingest source file and provides a decoded
 * text stream, so non-UTF-8 CSV/text uploads (Windows-1252, ISO-8859-1, etc.)
 * are transcoded instead of silently mangled into U+FFFD.
 *
 * @module
 */
import fs from "node:fs";
import { compose, type Readable } from "node:stream";

import chardet from "chardet";
import iconv from "iconv-lite";

import { logger } from "@/lib/logger";

/** Bytes sampled from the start of the file for charset detection. */
const DETECTION_SAMPLE_BYTES = 65536;

/** Line and tab controls; other control bytes point to UTF-16/32 or ISO-2022 rather than UTF-8 text. */
const TEXT_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0d]);
const isSuspiciousControl = (byte: number): boolean => byte === 0x7f || (byte < 0x20 && !TEXT_CONTROL_BYTES.has(byte));

/** A sample may end mid-character, so a trailing incomplete sequence still counts as valid. */
const isUtf8Text = (sample: Buffer): boolean => {
  if (sample.some(isSuspiciousControl)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: true });
    return true;
  } catch {
    return false;
  }
};

/** Trust valid UTF-8 before letting statistical detection guess on short samples. */
const detectSampleEncoding = (sample: Buffer): string => {
  if (isUtf8Text(sample)) return "utf-8";
  const detected = chardet.detect(sample);
  return detected && iconv.encodingExists(detected) ? detected : "utf-8";
};

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
    return detectSampleEncoding(sample);
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * Decode an in-memory buffer to a UTF-8 string without a byte order mark,
 * detecting its source encoding from a leading sample instead of assuming UTF-8.
 */
export const decodeBufferToUtf8 = (buffer: Buffer): string =>
  iconv.decode(buffer, detectSampleEncoding(buffer.subarray(0, DETECTION_SAMPLE_BYTES)));

/**
 * Open a file as a UTF-8 text stream without a byte order mark, transcoding on
 * the fly if the source bytes are in a different detected encoding.
 */
export const createDecodedTextStream = (filePath: string): Readable => {
  const encoding = detectFileEncoding(filePath);
  if (encoding !== "utf-8") logger.info("Transcoding non-UTF-8 ingest file", { filePath, encoding });
  return compose(fs.createReadStream(filePath), iconv.decodeStream(encoding));
};
