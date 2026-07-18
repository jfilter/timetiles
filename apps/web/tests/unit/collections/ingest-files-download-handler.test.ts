/**
 * Unit tests for the ingest-files download handler.
 *
 * Verifies canonical CSV uploads are formula-escaped at serve time (CWE-1236)
 * while non-CSV files pass through to Payload's default serving untouched.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), getIngestFilePath: vi.fn() }));

vi.mock("node:fs/promises", () => ({ default: { readFile: mocks.readFile } }));
vi.mock("@/lib/ingest/upload-path", () => ({ getIngestFilePath: mocks.getIngestFilePath }));

import { ingestFileDownloadHandler } from "@/lib/collections/ingest-files/download-handler";

type HandlerDoc = { id: number; mimeType?: string; filename?: string; originalName?: string };

const callHandler = (doc: HandlerDoc, filename: string, prefix?: string): Promise<Response | void> =>
  (ingestFileDownloadHandler as unknown as (req: unknown, args: unknown) => Promise<Response | void>)(
    {},
    { doc, params: { collection: "ingest-files", filename, prefix } }
  );

// Sequential: these tests assert call counts on the shared fs mock, which would
// race under vitest's default concurrent execution (sequence.concurrent).
describe.sequential("ingestFileDownloadHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIngestFilePath.mockReturnValue("/uploads/ingest-files/data.csv");
  });

  it("formula-escapes CSV cells and forces an attachment download", async () => {
    mocks.readFile.mockResolvedValue('name,note\nAlice,=HYPERLINK("http://evil")\nBob,ok');

    const res = (await callHandler(
      { id: 1, mimeType: "text/csv", filename: "data.csv", originalName: "orig.csv" },
      "data.csv"
    )) as Response;

    expect(res).toBeInstanceOf(Response);
    const body = await res.text();
    expect(body).toContain("'=HYPERLINK");
    expect(body).toContain("Bob");
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="orig.csv"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("passes non-CSV files through to Payload's default serving", async () => {
    const res = await callHandler(
      { id: 2, mimeType: "application/vnd.ms-excel", filename: "sheet.xlsx" },
      "sheet.xlsx"
    );

    expect(res).toBeUndefined();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("recognizes CSVs by extension even without a mimeType", async () => {
    mocks.readFile.mockResolvedValue("v\n=1+1");

    const res = (await callHandler({ id: 3, filename: "data.csv" }, "data.csv")) as Response;

    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toContain("'=1+1");
  });

  it("falls through (undefined) when the file cannot be read", async () => {
    mocks.readFile.mockRejectedValue(new Error("ENOENT"));

    const res = await callHandler({ id: 4, mimeType: "text/csv", filename: "missing.csv" }, "missing.csv");

    expect(res).toBeUndefined();
  });

  it("does not run for prefixed (size-variant) reads", async () => {
    const res = await callHandler({ id: 5, mimeType: "text/csv", filename: "data.csv" }, "data.csv", "thumbnail");

    expect(res).toBeUndefined();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("sanitizes the download filename to prevent header injection", async () => {
    mocks.readFile.mockResolvedValue("a\n1");

    const res = (await callHandler(
      { id: 6, mimeType: "text/csv", filename: "data.csv", originalName: 'ev"il\r\n.csv' },
      "data.csv"
    )) as Response;

    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).toContain('filename="ev_il__.csv"');
  });
});
