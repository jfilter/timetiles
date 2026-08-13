/**
 * Parity tests for the three readers that see the same spreadsheet.
 *
 * The wizard preview, dataset detection and the import itself each open the workbook with
 * their own SheetJS options. Whenever those drift, the user is promised something the import
 * does not deliver — a row count that shrinks on import, or a column name that never appears
 * in the imported rows. The import path is the reference; the other two must agree with it.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The preview helpers reach the Payload config through the rate-limit middleware; none of
// the three readers under test touches it.
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { utils, write } from "xlsx";

import { parseExcelPreview } from "@/app/api/ingest/preview-schema/helpers";
import { cleanupSidecarFiles, getFileRowCount, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { processExcelFile } from "@/lib/jobs/handlers/dataset-detection/parse-files";

let tempDir: string;

/**
 * A sheet with the two cases the readers used to disagree on: a fully empty row inside the
 * used range, and header cells that are not strings (a date and a number).
 */
const writeTrickyWorkbook = (): string => {
  const rows = [
    ["title", new Date("2026-03-15T00:00:00Z"), 42],
    ["Event A", new Date("2026-03-15T00:00:00Z"), 1],
    [null, null, null],
    ["Event B", new Date("2026-04-01T00:00:00Z"), 2],
  ];
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), "S1");

  const filePath = path.join(tempDir, "tricky.xlsx");
  fs.writeFileSync(filePath, write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);
  return filePath;
};

/** What the import actually produces — the reference both other readers are measured against. */
const readImported = async (filePath: string): Promise<Record<string, unknown>[]> => {
  const rows: Record<string, unknown>[] = [];
  try {
    for await (const batch of streamBatchesFromFile(filePath, { batchSize: 100 })) {
      rows.push(...batch);
    }
  } finally {
    cleanupSidecarFiles(filePath);
  }
  return rows;
};

describe.sequential("Excel reader parity", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "excel-parity-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("preview, detection and import agree on the row count", async () => {
    const filePath = writeTrickyWorkbook();

    const imported = await readImported(filePath);
    const [previewSheet] = await parseExcelPreview(filePath);
    const [detectedSheet] = await processExcelFile(filePath);

    // Two data rows: the all-empty middle row is padding, not data.
    expect(imported).toHaveLength(2);
    expect(previewSheet?.rowCount).toBe(imported.length);
    expect(detectedSheet?.rowCount).toBe(imported.length);
    expect(await getFileRowCount(filePath)).toBe(imported.length);
  });

  it("preview, detection and import agree on the column names", async () => {
    const filePath = writeTrickyWorkbook();

    const imported = await readImported(filePath);
    const [previewSheet] = await parseExcelPreview(filePath);
    const [detectedSheet] = await processExcelFile(filePath);

    // Compared as sets: a numeric column name sorts ahead of the rest in an object's own
    // key order, which says nothing about the readers.
    const importedColumns = Object.keys(imported[0] ?? {});
    expect(importedColumns).toContain("title");
    // Formatted text, not the raw date serial — the sidecar CSV holds what the cell displays.
    expect(importedColumns.some((column) => /^\d{5}\./.test(column))).toBe(false);

    expect(new Set(previewSheet?.headers)).toEqual(new Set(importedColumns));
    expect(new Set(detectedSheet?.headers)).toEqual(new Set(importedColumns));
  });

  it("keeps the preview sample free of padding rows", async () => {
    const filePath = writeTrickyWorkbook();

    const [previewSheet] = await parseExcelPreview(filePath);

    expect(previewSheet?.sampleData).toHaveLength(2);
    for (const row of previewSheet?.sampleData ?? []) {
      expect(Object.values(row).some((value) => value !== null && value !== "")).toBe(true);
    }
  });
});
