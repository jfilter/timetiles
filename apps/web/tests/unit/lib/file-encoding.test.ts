/**
 * Regression tests for source encoding detection.
 * @module
 */
import "@/tests/mocks/services/logger";

import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDecodedTextStream, decodeBufferToUtf8 } from "@/lib/ingest/file-encoding";

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

describe("decoded stream lifecycle", () => {
  let directory: string;
  let filePath: string;
  let source: fs.ReadStream;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "encoding-stream-"));
    filePath = path.join(directory, "utf16.csv");
    fs.writeFileSync(filePath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("name\nExample", "utf16le")]));
    source = fs.createReadStream(filePath);
    vi.spyOn(fs, "createReadStream").mockReturnValue(source);
  });

  afterEach(() => {
    source.destroy();
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("forwards source errors to the decoded stream", async () => {
    const decoded = createDecodedTextStream(filePath);
    const error = new Error("Source read failed");
    const received = once(decoded, "error");
    source.emit("error", error);
    expect(await received).toEqual([error]);
  });

  it("closes the source when the decoded stream is abandoned", async () => {
    const decoded = createDecodedTextStream(filePath);
    const aborted = once(decoded, "error");
    decoded.destroy();
    expect(await aborted).toEqual([expect.objectContaining({ code: "ABORT_ERR" })]);
    expect(source.destroyed).toBe(true);
  });
});
