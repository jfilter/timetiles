/**
 * Parity tests for the readers that see the same CSV file.
 *
 * The wizard preview, dataset detection, the row count and the import each parse the file.
 * The import is the reference: the others must report its header names, rows and count.
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
// the readers under test touches it.
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { parseCSVPreview, parseFileSheets } from "@/app/api/ingest/preview-schema/helpers";
import { getFileRowCount, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { processCSVFile } from "@/lib/jobs/handlers/dataset-detection/parse-files";

let tempDir: string;

const readImported = async (filePath: string): Promise<Record<string, unknown>[]> => {
  const rows: Record<string, unknown>[] = [];
  for await (const batch of streamBatchesFromFile(filePath, { batchSize: 100 })) {
    rows.push(...batch);
  }
  return rows;
};

describe.sequential("CSV reader parity", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-parity-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each([
    ["duplicate header names", "a,a,b\n1,2,3\n"],
    ["a blank line before duplicate header names", "\na,a,b\n1,2,3\n"],
    ["two whitespace-only lines before the header", "  \n \t\na,b\n1,2\n"],
    ["a BOM followed by blank lines", "﻿\n\na,b\n1,2\n3,4\n"],
    ["a whitespace-only data line", "a,b\n1,2\n   \n3,4\n"],
    ["a data line longer than the header", "a,b\n1,2,3\n"],
    ["a BOM before a quoted header", '\uFEFF"Name","Value"\r\n"x","1"\r\n"y","2"\r\n'],
    ["a BOM and a blank line before a semicolon header", "\uFEFF\na;b\n1;2\n3;4\n"],
    ["a BOM before a quoted header containing the delimiter", '\uFEFF"a,b",c\n1,2\n'],
  ])("preview, detection, count and import agree for %s", async (_label, content) => {
    const filePath = path.join(tempDir, "input.csv");
    fs.writeFileSync(filePath, content, "utf-8");

    const imported = await readImported(filePath);
    const [previewSheet] = parseCSVPreview(filePath);
    const [detectedSheet] = await processCSVFile(filePath);
    const importedColumns = Object.keys(imported[0] ?? {}).filter((key) => key !== "__parsed_extra");

    expect(imported.length).toBeGreaterThan(0);
    expect(previewSheet?.headers).toEqual(importedColumns);
    expect(previewSheet?.sampleData).toEqual(imported);
    expect(previewSheet?.rowCount).toBe(imported.length);
    expect(detectedSheet?.headers).toEqual(importedColumns);
    expect(detectedSheet?.rowCount).toBe(imported.length);
    expect(await getFileRowCount(filePath)).toBe(imported.length);
  });

  it("imports the header names after a byte order mark without quotes", async () => {
    const filePath = path.join(tempDir, "input.csv");
    fs.writeFileSync(filePath, '\uFEFF"Name","Value"\r\n"x","1"\r\n', "utf-8");

    expect(await readImported(filePath)).toEqual([{ Name: "x", Value: "1" }]);
  });

  it("previews a .txt file with the CSV reader the import uses", async () => {
    // A CSV served as text/plain is stored as .txt; spreadsheet parsing would coerce the values.
    const filePath = path.join(tempDir, "input.txt");
    fs.writeFileSync(filePath, "id;city;date\n007;Köln;2024-03-05\n", "utf-8");

    const imported = await readImported(filePath);
    const [previewSheet] = await parseFileSheets(filePath);

    expect(imported).toEqual([{ id: "007", city: "Köln", date: "2024-03-05" }]);
    expect(previewSheet?.sampleData).toEqual(imported);
  });
});
