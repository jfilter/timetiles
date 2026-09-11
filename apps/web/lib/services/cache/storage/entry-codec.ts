/**
 * Binary-safe serialization for file-system cache entries.
 *
 * Node's native serializer preserves binary values without JSON expansion or
 * reserved user-data keys. Legacy JSON and version-one envelopes remain readable.
 *
 * @module
 * @category Services/Cache/Storage
 */

import { deserialize, serialize } from "node:v8";

import type { CacheEntry } from "../types";

/** Marks a binary payload extracted into the trailing blob section. */
const BUFFER_MARKER = "__cacheBuffer__";

/** Distinguishes the binary envelope from legacy plain-JSON cache files. */
const MAGIC = Buffer.from("TTCACHE1\n", "utf-8");
const NATIVE_MAGIC = Buffer.from("TTCACHE2\n", "utf-8");

interface EnvelopeHeader {
  entry: unknown;
  blobs: number[];
}

const restoreBlobs = (value: unknown, blobs: Buffer[]): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => restoreBlobs(item, blobs));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const marker = record[BUFFER_MARKER];
    if (typeof marker === "number") {
      const blob = blobs[marker];
      if (!blob) throw new Error("Malformed cache envelope: invalid blob reference");
      return blob;
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, restoreBlobs(v, blobs)]));
  }
  return value;
};

/** Serialize with an explicit byte length to reject truncated or appended data. */
export const encodeEntry = <T>(entry: CacheEntry<T>): Buffer => {
  const body = serialize(entry);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([NATIVE_MAGIC, length, body]);
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
    if (!Number.isSafeInteger(length) || length < 0 || length > raw.length - offset) {
      throw new Error("Malformed cache envelope: invalid blob length");
    }
    blobs.push(raw.subarray(offset, offset + length));
    offset += length;
  }
  if (offset !== raw.length) {
    throw new Error("Malformed cache envelope: unexpected trailing data");
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
  if (raw.subarray(0, NATIVE_MAGIC.length).equals(NATIVE_MAGIC)) {
    const offset = NATIVE_MAGIC.length + 4;
    if (raw.length < offset || raw.readUInt32BE(NATIVE_MAGIC.length) !== raw.length - offset) {
      throw new Error("Malformed cache envelope: invalid payload length");
    }
    return deserialize(raw.subarray(offset)) as CacheEntry<T>;
  }
  if (raw.subarray(0, MAGIC.length).equals(MAGIC)) {
    return decodeEnvelope<T>(raw);
  }
  return reviveDates(JSON.parse(raw.toString("utf-8")) as CacheEntry<T>);
};
