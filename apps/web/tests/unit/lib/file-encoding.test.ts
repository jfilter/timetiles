/**
 * Regression tests for source encoding detection.
 * @module
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it } from "vitest";

import { decodeBufferToUtf8 } from "@/lib/ingest/file-encoding";

describe("source buffer decoding", () => {
  it.each(["", "\n\n", "\r\n", "a", "name,date\nExample,2024-01-01\n"])("preserves ASCII text %j", (content) => {
    expect(decodeBufferToUtf8(Buffer.from(content))).toBe(content);
  });

  it("preserves UTF-16 text with a byte-order mark", () => {
    const content = "name\nExample\n";
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")]);
    expect(decodeBufferToUtf8(buffer)).toBe(content);
  });
});
