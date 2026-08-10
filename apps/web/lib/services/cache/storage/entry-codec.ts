/**
 * Binary-safe serialization for file-system cache entries.
 *
 * Binary payloads (Buffer / typed arrays) are stored as raw bytes appended after a JSON
 * header instead of being embedded as `{"type":"Buffer","data":[...]}` — that expansion
 * costs ~11 characters per source byte and throws `RangeError: Invalid string length`
 * for bodies past ~48 MB.
 *
 * @module
 * @category Services/Cache/Storage
 */

import type { CacheEntry } from "../types";

/** Marks a binary payload extracted into the trailing blob section. */
const BUFFER_MARKER = "__cacheBuffer__";

/** Distinguishes the binary envelope from legacy plain-JSON cache files. */
const MAGIC = Buffer.from("TTCACHE1\n", "utf-8");

interface EnvelopeHeader {
  entry: unknown;
  blobs: number[];
}

const toBuffer = (value: Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength);

const extractBlobs = (value: unknown, blobs: Buffer[]): unknown => {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    blobs.push(toBuffer(value));
    return { [BUFFER_MARKER]: blobs.length - 1 };
  }
  if (Array.isArray(value)) {
    return value.map((item) => extractBlobs(item, blobs));
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, extractBlobs(v, blobs)]));
  }
  return value;
};

const restoreBlobs = (value: unknown, blobs: Buffer[]): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => restoreBlobs(item, blobs));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const marker = record[BUFFER_MARKER];
    if (typeof marker === "number") {
      return blobs[marker] ?? Buffer.alloc(0);
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, restoreBlobs(v, blobs)]));
  }
  return value;
};

/** Serialize a cache entry into a binary envelope: magic + JSON header + raw blobs. */
export const encodeEntry = <T>(entry: CacheEntry<T>): Buffer => {
  const blobs: Buffer[] = [];
  const header: EnvelopeHeader = { entry: extractBlobs(entry, blobs), blobs: blobs.map((blob) => blob.length) };
  // JSON never contains a raw newline, so "\n" safely terminates the header.
  const headerBuffer = Buffer.from(`${JSON.stringify(header)}\n`, "utf-8");
  return Buffer.concat([MAGIC, headerBuffer, ...blobs]);
};

const decodeEnvelope = <T>(raw: Buffer): CacheEntry<T> => {
  const headerEnd = raw.indexOf(0x0a, MAGIC.length);
  if (headerEnd === -1) {
    throw new Error("Malformed cache envelope: missing header terminator");
  }

  const header: EnvelopeHeader = JSON.parse(raw.subarray(MAGIC.length, headerEnd).toString("utf-8"));
  const blobs: Buffer[] = [];
  let offset = headerEnd + 1;
  for (const length of header.blobs) {
    blobs.push(raw.subarray(offset, offset + length));
    offset += length;
  }

  return reviveDates(restoreBlobs(header.entry, blobs) as CacheEntry<T>);
};

const reviveDates = <T>(entry: CacheEntry<T>): CacheEntry<T> => {
  const metadata = entry.metadata;
  metadata.createdAt = new Date(metadata.createdAt);
  metadata.lastAccessedAt = new Date(metadata.lastAccessedAt);
  if (metadata.expiresAt) metadata.expiresAt = new Date(metadata.expiresAt);
  return entry;
};

/** Parse a cache file, accepting both the binary envelope and legacy plain-JSON files. */
export const decodeEntry = <T>(raw: Buffer): CacheEntry<T> => {
  if (raw.subarray(0, MAGIC.length).equals(MAGIC)) {
    return decodeEnvelope<T>(raw);
  }
  return reviveDates(JSON.parse(raw.toString("utf-8")) as CacheEntry<T>);
};
