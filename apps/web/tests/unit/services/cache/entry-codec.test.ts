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

describe("cache entry codec", () => {
  it("round-trips multiple blobs, including an empty blob", () => {
    expect(decodeEntry(encodeEntry(entry))).toEqual(entry);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, 100, "5"])("rejects an invalid blob length %s", (length) => {
    const raw = encodeEntry(entry);
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
    expect(() => decodeEntry(malformed)).toThrow("unexpected trailing data");
  });
});
