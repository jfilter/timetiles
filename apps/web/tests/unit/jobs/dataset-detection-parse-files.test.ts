/**
 * Unit tests for dataset detection file parsing helpers.
 *
 * @module
 * @category Unit Tests
 */
// Import centralized logger mock FIRST (before anything that uses @/lib/logger)
import "@/tests/mocks/services/logger";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { processCSVFile } from "@/lib/jobs/handlers/dataset-detection/parse-files";

describe("dataset detection parse-files", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dataset-detection-parse-files-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should count CSV records with quoted multiline fields", async () => {
    const filePath = path.join(tempDir, "multiline.csv");
    fs.writeFileSync(filePath, 'id,description\n1,"line one\nline two"\n2,"simple"\n', "utf-8");

    const sheets = await processCSVFile(filePath);

    expect(sheets).toEqual([
      { name: "CSV Data", index: 0, rowCount: 2, columnCount: 2, headers: ["id", "description"] },
    ]);
  });
});
