/**
 * Binary cache envelope integrity tests.
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { decodeEntry, encodeEntry } from "@/lib/services/cache/storage/entry-codec";
import type { CacheEntry } from "@/lib/services/cache/types";

const entry: CacheEntry<Buffer[]> = {
  key: "binary-entry",
  value: [Buffer.from("first"), Buffer.alloc(0), Buffer.from("last")],
  metadata: { createdAt: new Date(0), lastAccessedAt: new Date(0), accessCount: 0 },
};

const legacyEntry = Buffer.concat([
  Buffer.from(
    `TTCACHE1\n${JSON.stringify({
      entry: { ...entry, value: entry.value.map((_, index) => ({ __cacheBuffer__: index })) },
      blobs: entry.value.map((blob) => blob.length),
    })}\n`
  ),
  ...entry.value,
]);

describe("cache entry codec", () => {
  it("round-trips multiple blobs, including an empty blob", () => {
    expect(decodeEntry(encodeEntry(entry))).toEqual(entry);
  });

  it("reads legacy binary envelopes", () => {
    expect(decodeEntry(legacyEntry)).toEqual(entry);
  });

  it("reads legacy plain JSON entries", () => {
    const original = { ...entry, value: { title: "Legacy" } };
    expect(decodeEntry(Buffer.from(JSON.stringify(original)))).toEqual(original);
  });

  it.each([false, true])("preserves user objects containing the binary marker (with blob: %s)", (withBlob) => {
    const value = {
      userData: { __cacheBuffer__: 0, title: "Preserve this object" },
      ...(withBlob ? { binary: Buffer.from("actual blob") } : {}),
    };
    const original = { ...entry, value };
    expect(decodeEntry(encodeEntry(original))).toEqual(original);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, 100, "5"])("rejects an invalid blob length %s", (length) => {
    const raw = legacyEntry;
    const magicEnd = raw.indexOf(0x0a) + 1;
    const headerEnd = raw.indexOf(0x0a, magicEnd);
    const header = JSON.parse(raw.subarray(magicEnd, headerEnd).toString("utf8")) as { blobs: unknown[] };
    header.blobs[0] = length;
    const malformed = Buffer.concat([
      raw.subarray(0, magicEnd),
      Buffer.from(`${JSON.stringify(header)}\n`),
      raw.subarray(headerEnd + 1),
    ]);
    expect(() => decodeEntry(malformed)).toThrow("invalid blob length");
  });

  it("rejects payload bytes not declared in the header", () => {
    const malformed = Buffer.concat([encodeEntry(entry), Buffer.from("extra")]);
    expect(() => decodeEntry(malformed)).toThrow("invalid payload length");
  });

  it("rejects truncated native envelopes", () => {
    const raw = encodeEntry(entry);
    expect(() => decodeEntry(raw.subarray(0, -1))).toThrow("invalid payload length");
    expect(() => decodeEntry(raw.subarray(0, 9))).toThrow("invalid payload length");
  });

  it("rejects trailing data in legacy envelopes", () => {
    expect(() => decodeEntry(Buffer.concat([legacyEntry, Buffer.from("extra")]))).toThrow("unexpected trailing data");
  });

  it.each([0, -1, 0.5])("rejects a reference to an absent blob %s", (marker) => {
    const header = { entry: { ...entry, value: { __cacheBuffer__: marker } }, blobs: [] };
    const malformed = Buffer.from(`TTCACHE1\n${JSON.stringify(header)}\n`);
    expect(() => decodeEntry(malformed)).toThrow("invalid blob reference");
  });
});
