/**
 * Unit tests for the ingest-files download handler.
 *
 * Verifies canonical CSV uploads are formula-escaped at serve time (CWE-1236)
 * while non-CSV files pass through to Payload's default serving untouched. Uses
 * real temp files so the streaming escape path is exercised end-to-end.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getIngestFilePath: vi.fn() }));

vi.mock("@/lib/ingest/upload-path", () => ({ getIngestFilePath: mocks.getIngestFilePath }));

import { ingestFileDownloadHandler } from "@/lib/collections/ingest-files/download-handler";

type HandlerDoc = { id: number; mimeType?: string; filename?: string; originalName?: string };

let tmpDir: string;

/** Write CSV content to a temp file and point getIngestFilePath at it. */
const stageFile = async (filename: string, content: string): Promise<void> => {
  const filePath = path.join(tmpDir, filename);
  await fsPromises.writeFile(filePath, content, "utf-8");
  mocks.getIngestFilePath.mockReturnValue(filePath);
};

const callHandler = (doc: HandlerDoc | undefined, filename: string, prefix?: string): Promise<Response | void> =>
  (ingestFileDownloadHandler as unknown as (req: unknown, args: unknown) => Promise<Response | void>)(
    {},
    { doc, params: { collection: "ingest-files", filename, prefix } }
  );

describe.sequential("ingestFileDownloadHandler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ingest-dl-"));
    // Default: a nonexistent path (individual tests stage a real file when needed).
    mocks.getIngestFilePath.mockReturnValue(path.join(tmpDir, "missing.csv"));
  });

  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it("formula-escapes CSV cells and forces an attachment download", async () => {
    await stageFile("data.csv", 'name,note\nAlice,=HYPERLINK("http://evil")\nBob,ok');

    const res = (await callHandler(
      { id: 1, mimeType: "text/csv", filename: "data.csv", originalName: "orig.csv" },
      "data.csv"
    )) as Response;

    expect(res).toBeInstanceOf(Response);
    const body = await res.text();
    expect(body).toContain("'=HYPERLINK");
    expect(body).toContain("Bob");
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain('filename="orig.csv"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("escapes a formula in a semicolon-delimited CSV (EU locale)", async () => {
    await stageFile("eu.csv", "name;value\nx;=1+1\n");

    const res = (await callHandler({ id: 2, mimeType: "text/csv", filename: "eu.csv" }, "eu.csv")) as Response;

    expect(await res.text()).toContain("x;'=1+1");
  });

  it("preserves a quoted embedded newline while escaping a later formula", async () => {
    await stageFile("multiline.csv", 'a,b\n"line1\nline2",=1+1\nx,ok\n');

    const res = (await callHandler(
      { id: 3, mimeType: "text/csv", filename: "multiline.csv" },
      "multiline.csv"
    )) as Response;

    const body = await res.text();
    expect(body).toContain('"line1\nline2"');
    expect(body).toContain("'=1+1");
  });

  it("preserves non-UTF-8 (Windows-1252) source bytes verbatim while escaping", async () => {
    // "José,=1" with é as the single Windows-1252 byte 0xE9.
    const filePath = path.join(tmpDir, "latin.csv");
    await fsPromises.writeFile(filePath, Buffer.from([0x4a, 0x6f, 0x73, 0xe9, 0x2c, 0x3d, 0x31]));
    mocks.getIngestFilePath.mockReturnValue(filePath);

    const res = (await callHandler({ id: 20, mimeType: "text/csv", filename: "latin.csv" }, "latin.csv")) as Response;
    const out = Buffer.from(await res.arrayBuffer());

    // 0xE9 is preserved (a UTF-8 decode would have replaced it with EF BF BD),
    // and an apostrophe (0x27) is inserted before the `=` (0x3D).
    expect([...out]).toEqual([0x4a, 0x6f, 0x73, 0xe9, 0x2c, 0x27, 0x3d, 0x31]);
  });

  it("passes non-CSV files through to Payload's default serving", async () => {
    const res = await callHandler(
      { id: 4, mimeType: "application/vnd.ms-excel", filename: "sheet.xlsx" },
      "sheet.xlsx"
    );

    expect(res).toBeUndefined();
    expect(mocks.getIngestFilePath).not.toHaveBeenCalled();
  });

  it("recognizes CSVs by extension even without a mimeType", async () => {
    await stageFile("noext.csv", "v\n=1+1");

    const res = (await callHandler({ id: 5, filename: "noext.csv" }, "noext.csv")) as Response;

    expect(await res.text()).toContain("'=1+1");
  });

  it("falls through (undefined) when the file cannot be read", async () => {
    // Default mock points at a nonexistent file.
    const res = await callHandler({ id: 6, mimeType: "text/csv", filename: "missing.csv" }, "missing.csv");

    expect(res).toBeUndefined();
  });

  it("does not run for prefixed (size-variant) reads", async () => {
    const res = await callHandler({ id: 7, mimeType: "text/csv", filename: "data.csv" }, "data.csv", "thumbnail");

    expect(res).toBeUndefined();
    expect(mocks.getIngestFilePath).not.toHaveBeenCalled();
  });

  it("still escapes when Payload passes no doc (privileged read) — extension fallback", async () => {
    await stageFile("priv.csv", "v\n=1+1");

    // Privileged reads (access.read === true) skip the record fetch → doc undefined.
    const res = (await callHandler(undefined, "priv.csv")) as Response;

    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toContain("'=1+1");
  });

  it("passes non-CSV through even when doc is undefined (no crash)", async () => {
    const res = await callHandler(undefined, "sheet.xlsx");

    expect(res).toBeUndefined();
    expect(mocks.getIngestFilePath).not.toHaveBeenCalled();
  });

  it("emits an RFC 5987 header for a non-latin original name (no ByteString crash)", async () => {
    await stageFile("data.csv", "a\n1");

    const res = (await callHandler(
      { id: 8, mimeType: "text/csv", filename: "data.csv", originalName: "日本語.csv" },
      "data.csv"
    )) as Response;

    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent("日本語.csv"));
    expect(/^[\x20-\x7e]*$/.test(disposition)).toBe(true);
  });

  it("sanitizes CR/LF/quote in the download filename", async () => {
    await stageFile("data.csv", "a\n1");

    const res = (await callHandler(
      { id: 9, mimeType: "text/csv", filename: "data.csv", originalName: 'ev"il\r\n.csv' },
      "data.csv"
    )) as Response;

    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).toContain('filename="ev_il__.csv"');
  });
});
