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
import { UTF8_BOM } from "@/lib/utils/csv-escape";

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

  /** Exercise the real download stream with byte-preserving input and output. */
  const downloadCsv = async (content: string): Promise<string> => {
    const filename = "formula-cases.csv";
    const filePath = path.join(tmpDir, filename);
    await fsPromises.writeFile(filePath, Buffer.from(content, "latin1"));
    mocks.getIngestFilePath.mockReturnValue(filePath);
    const response = (await callHandler({ id: 1, mimeType: "text/csv", filename }, filename)) as Response;
    return Buffer.from(await response.arrayBuffer()).toString("latin1");
  };

  describe("CSV formula safety cases", () => {
    const rowsOf = (csv: string): string[] => csv.split(/\r?\n/);

    it("prefixes an apostrophe to formula cells while leaving safe cells untouched", async () => {
      const input = 'name,note\nAlice,=HYPERLINK("http://evil")\nBob,hello';
      const out = await downloadCsv(input);
      // The dangerous cell is neutralized without reserializing the CSV.
      expect(out).toContain("'=HYPERLINK");
      // Header and benign values are unchanged.
      expect(rowsOf(out)[0]).toBe("name,note");
      expect(out).toContain("Bob");
      expect(out).toContain("hello");
    });

    it("escapes the classic OWASP formula-trigger characters", async () => {
      const input = "v\n=1+1\n+1\n-1\n@SUM\nplain";
      const out = await downloadCsv(input);
      expect(out).toContain("'=1+1");
      expect(out).toContain("'+1");
      expect(out).toContain("'-1");
      expect(out).toContain("'@SUM");
      // A plain value keeps no apostrophe.
      expect(rowsOf(out).at(-1)).toBe("plain");
    });

    it("preserves row/column structure and returns '' for empty input", async () => {
      const input = "a,b,c\n1,2,3\n4,5,6";
      const out = await downloadCsv(input);
      expect(rowsOf(out)).toEqual(["a,b,c", "1,2,3", "4,5,6"]);
      expect(await downloadCsv("")).toBe("");
    });

    it("escapes a formula in a SEMICOLON-delimited file (EU locale)", async () => {
      const out = await downloadCsv("name;value\nx;=1+1\n");
      expect(out).toContain("x;'=1+1");
      // Structure preserved verbatim (only an apostrophe inserted).
      expect(out).not.toContain("x,");
    });

    it("escapes a formula in a TAB-delimited file", async () => {
      const out = await downloadCsv("a\tb\nx\t=SUM(A1)\n");
      expect(out).toContain("\t'=SUM(A1)");
    });

    it("escapes an ambiguous file that both ',' and ';' could split (delimiter-agnostic)", async () => {
      // Commas in the first field make ',' and ';' equally plausible; a delimiter
      // heuristic would pick ',' and miss the `;`-cell formula. The boundary scan
      // escapes the `=` because it follows a `;` regardless.
      const out = await downloadCsv("first,last;formula\nx,y;=1+1\n");
      expect(out).toContain(";'=1+1");
    });

    it("escapes a formula that follows a boundary inside a quoted value (safe over-escape)", async () => {
      // "x,=y" is technically one cell starting with 'x', but a semicolon/other
      // locale could still split it; the boundary scan escapes conservatively.
      const out = await downloadCsv('a,b\n"x,=y",ok\n');
      expect(out).toContain(",'=y");
    });

    it("preserves a leading UTF-8 BOM at the file start", async () => {
      const out = await downloadCsv(`${UTF8_BOM}name,value\nx,=1+1\n`);
      expect(out.startsWith(`${UTF8_BOM}name,value`)).toBe(true);
      expect(out).toContain(",'=1+1");
    });

    it("escapes a formula that a stripped BOM would expose as the first cell", async () => {
      // A spreadsheet drops the leading BOM, so `<BOM>=1+1` becomes cell A1 = =1+1.
      expect(await downloadCsv(`${UTF8_BOM}=1+1,x`)).toBe(`${UTF8_BOM}'=1+1,x`);
      expect(await downloadCsv(`${UTF8_BOM}"=1+1",x`)).toBe(`${UTF8_BOM}"'=1+1",x`);
    });

    it("escapes a formula after an embedded NUL that spreadsheets strip", async () => {
      // Excel/Calc drop embedded NULs, so `x,\0=1+1` becomes a `=1+1` cell.
      expect(await downloadCsv("name,value\nx,\x00=1+1")).toContain(",\x00'=1+1");
    });

    it("escapes formulas after RS/US separators that Papa also auto-detects", async () => {
      expect(await downloadCsv("name\x1fvalue\nx\x1f=1+1")).toContain("\x1f'=1+1");
      expect(await downloadCsv("a\x1e=b")).toBe("a\x1e'=b");
    });

    it("honors an Excel sep= directive declaring an arbitrary delimiter", async () => {
      // sep=: makes ':' the delimiter; the formula after it must be escaped.
      const out = await downloadCsv('sep=:\nname:value\nx:"=HYPERLINK(""http://evil"")"');
      expect(out).toContain(":\"'=HYPERLINK");
      // A column named "separator..." must NOT be misread as a sep= directive.
      expect(await downloadCsv("separator,x\n=1,y")).toContain("\n'=1,y");
    });

    it("escapes a formula opened with an apostrophe text-qualifier", async () => {
      // Excel supports ' as a text qualifier and strips it → cell becomes =1+1.
      expect(await downloadCsv("name,value\nx,'=1+1'")).toContain(",''=1+1");
    });

    it("honors a QUOTED sep= directive (LibreOffice Calc)", async () => {
      const out = await downloadCsv('"sep=:"\nname:value\nx:"=WEBSERVICE(""http://evil"")"');
      expect(out).toContain(":\"'=WEBSERVICE");
    });

    it("does NOT escape a trigger char that is itself the declared sep= separator", async () => {
      // Empty fields and the directive must survive intact when sep is a trigger.
      expect(await downloadCsv("sep=+\na++b")).toBe("sep=+\na++b");
      expect(await downloadCsv("sep==\na==b")).toBe("sep==\na==b");
      // A real formula cell (trigger != separator) is still escaped.
      expect(await downloadCsv("sep=+\na+=x")).toContain("+'=x");
    });

    it("neutralizes a SYLK-magic file (leading uppercase ID) that Excel would run", async () => {
      const out = await downloadCsv("ID;PSheetJS;N;E\nC;X1;K0;EWEBSERVICE(x)");
      expect(out.startsWith("'ID;")).toBe(true);
      // BOM is kept before the neutralizer.
      expect((await downloadCsv(`${UTF8_BOM}ID;X`)).startsWith(`${UTF8_BOM}'ID;`)).toBe(true);
      // A normal file NOT starting with ID is untouched.
      expect((await downloadCsv("name,id\n1,2")).startsWith("'")).toBe(false);
    });
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
