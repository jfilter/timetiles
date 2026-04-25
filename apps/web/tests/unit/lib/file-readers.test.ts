/**
 * Unit tests for the file-readers streaming and batch reading utilities.
 *
 * Tests the core streaming backpressure logic, sidecar CSV generation,
 * batch reading, and edge cases like empty files and exact boundaries.
 *
 * @module
 * @category Tests
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { cleanupSidecarFiles, getFileRowCount, getSidecarPath, streamBatchesFromFile } from "@/lib/ingest/file-readers";

import { getFixturePath } from "../../setup/paths";

/** Collect all batches from an async generator into an array. */
const collectBatches = async (gen: AsyncIterable<Record<string, unknown>[]>): Promise<Record<string, unknown>[][]> => {
  const batches: Record<string, unknown>[][] = [];
  for await (const batch of gen) {
    batches.push(batch);
  }
  return batches;
};

/** Flatten batches into a single array of rows. */
const flattenBatches = async (gen: AsyncIterable<Record<string, unknown>[]>): Promise<Record<string, unknown>[]> => {
  const batches = await collectBatches(gen);
  return batches.flat();
};

describe.sequential("File Readers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-readers-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /** Write a CSV string to temp dir and return its path. */
  const writeTempCSV = (filename: string, content: string): string => {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  };

  describe("streamBatchesFromFile — CSV", () => {
    it("should stream a small file as a single batch", async () => {
      const csvPath = writeTempCSV("small.csv", "id,name\n1,Alice\n2,Bob\n3,Charlie\n");

      const batches = await collectBatches(streamBatchesFromFile(csvPath, { batchSize: 100 }));

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
      expect(batches[0]![0]).toEqual({ id: "1", name: "Alice" });
      expect(batches[0]![2]).toEqual({ id: "3", name: "Charlie" });
    });

    it("should split rows into multiple batches", async () => {
      const rows = Array.from({ length: 10 }, (_, i) => `${i + 1},Item ${i + 1}`);
      const csvPath = writeTempCSV("multi.csv", `id,name\n${rows.join("\n")}\n`);

      const batches = await collectBatches(streamBatchesFromFile(csvPath, { batchSize: 3 }));

      // 10 rows / 3 per batch = 4 batches (3, 3, 3, 1)
      expect(batches).toHaveLength(4);
      expect(batches[0]).toHaveLength(3);
      expect(batches[1]).toHaveLength(3);
      expect(batches[2]).toHaveLength(3);
      expect(batches[3]).toHaveLength(1);
    });

    it("should handle exact batch boundary (rows = batchSize)", async () => {
      const rows = Array.from({ length: 5 }, (_, i) => `${i + 1},Item ${i + 1}`);
      const csvPath = writeTempCSV("exact.csv", `id,name\n${rows.join("\n")}\n`);

      const batches = await collectBatches(streamBatchesFromFile(csvPath, { batchSize: 5 }));

      // Exactly one full batch, no remainder
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(5);
    });

    it("should handle exact multiple of batchSize", async () => {
      const rows = Array.from({ length: 6 }, (_, i) => `${i + 1},Item ${i + 1}`);
      const csvPath = writeTempCSV("multiple.csv", `id,name\n${rows.join("\n")}\n`);

      const batches = await collectBatches(streamBatchesFromFile(csvPath, { batchSize: 3 }));

      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(3);
      expect(batches[1]).toHaveLength(3);
    });

    it("should yield zero batches for header-only CSV", async () => {
      const csvPath = writeTempCSV("header-only.csv", "id,name\n");

      const batches = await collectBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(batches).toHaveLength(0);
    });

    it("should yield zero batches for empty CSV", async () => {
      const csvPath = writeTempCSV("empty.csv", "");

      const batches = await collectBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(batches).toHaveLength(0);
    });

    it("should preserve raw CSV values as strings for identity-sensitive fields", async () => {
      const csvPath = writeTempCSV("types.csv", "external_id,num,float,bool\n00123,42,3.14,true\n123,7,2.71,false\n");

      const rows = await flattenBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ external_id: "00123", num: "42", float: "3.14", bool: "true" });
      expect(rows[1]).toEqual({ external_id: "123", num: "7", float: "2.71", bool: "false" });
    });

    it("should trim whitespace from headers", async () => {
      const csvPath = writeTempCSV("whitespace.csv", "  id , name \n1,Alice\n");

      const rows = await flattenBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(rows[0]).toHaveProperty("id");
      expect(rows[0]).toHaveProperty("name");
    });

    it("should skip empty lines", async () => {
      const csvPath = writeTempCSV("empty-lines.csv", "id,name\n1,Alice\n\n\n2,Bob\n\n");

      const rows = await flattenBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(rows).toHaveLength(2);
    });

    it("should stream the valid-events fixture correctly", async () => {
      const fixturePath = getFixturePath("valid-events.csv");

      const rows = await flattenBatches(streamBatchesFromFile(fixturePath, { batchSize: 2 }));

      expect(rows).toHaveLength(6);
      expect(rows[0]).toMatchObject({ title: "Tech Conference 2024", category: "technology" });
    });

    it("should handle batchSize of 1", async () => {
      const csvPath = writeTempCSV("single.csv", "id\n1\n2\n3\n");

      const batches = await collectBatches(streamBatchesFromFile(csvPath, { batchSize: 1 }));

      expect(batches).toHaveLength(3);
      expect(batches.every((b) => b.length === 1)).toBe(true);
    });
  });

  describe("streamBatchesFromFile — Excel/ODS sidecar", () => {
    /** Copy a fixture into tempDir so sidecar files stay out of fixtures/. */
    const copyFixtureToTemp = (fixtureName: string): string => {
      const src = getFixturePath(fixtureName);
      const dest = path.join(tempDir, fixtureName);
      fs.copyFileSync(src, dest);
      return dest;
    };

    it("should stream Excel via sidecar CSV", async () => {
      const xlsxPath = copyFixtureToTemp("events.xlsx");

      const rows = await flattenBatches(streamBatchesFromFile(xlsxPath, { batchSize: 10 }));

      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toHaveProperty("title");
    });

    it("should create sidecar CSV file for Excel", async () => {
      const xlsxPath = copyFixtureToTemp("events.xlsx");
      const sidecarPath = getSidecarPath(xlsxPath, 0);

      await flattenBatches(streamBatchesFromFile(xlsxPath, { batchSize: 10 }));

      expect(fs.existsSync(sidecarPath)).toBe(true);

      // Sidecar should be valid CSV
      const content = fs.readFileSync(sidecarPath, "utf-8");
      expect(content).toContain("title");
    });

    it("should reuse existing sidecar CSV", async () => {
      const xlsxPath = copyFixtureToTemp("events.xlsx");
      const sidecarPath = getSidecarPath(xlsxPath, 0);

      // First call creates sidecar
      await flattenBatches(streamBatchesFromFile(xlsxPath, { batchSize: 10 }));
      const stat1 = fs.statSync(sidecarPath);

      // Second call reuses (mtime unchanged)
      await flattenBatches(streamBatchesFromFile(xlsxPath, { batchSize: 10 }));
      const stat2 = fs.statSync(sidecarPath);

      expect(stat1.mtimeMs).toBe(stat2.mtimeMs);
    });

    it("should stream ODS via sidecar CSV", async () => {
      const odsPath = copyFixtureToTemp("events.ods");

      const rows = await flattenBatches(streamBatchesFromFile(odsPath, { batchSize: 10 }));

      expect(rows.length).toBeGreaterThan(0);
    });

    it("should stream specific sheet from multi-sheet Excel", async () => {
      const xlsxPath = copyFixtureToTemp("multi-sheet.xlsx");

      const sheet0Rows = await flattenBatches(streamBatchesFromFile(xlsxPath, { sheetIndex: 0, batchSize: 100 }));

      const sheet1Rows = await flattenBatches(streamBatchesFromFile(xlsxPath, { sheetIndex: 1, batchSize: 100 }));

      expect(sheet0Rows.length).toBeGreaterThan(0);
      expect(sheet1Rows.length).toBeGreaterThan(0);
    });
  });

  describe("streamBatchesFromFile — CSV edge cases", () => {
    it("should handle CSV with BOM (byte order mark)", async () => {
      const bom = "\uFEFF";
      const csvPath = writeTempCSV("bom.csv", `${bom}id,name\n1,Alice\n`);

      const rows = await flattenBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(rows).toHaveLength(1);
      // Papa Parse strips BOM from stream input — first header should be clean
      expect(rows[0]).toHaveProperty("id");
      expect(rows[0]!.id).toBe("1");
    });

    it("should handle quoted fields with embedded newlines", async () => {
      const csvPath = writeTempCSV("newlines.csv", 'id,description\n1,"line one\nline two"\n2,"simple"\n');

      const rows = await flattenBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(rows).toHaveLength(2);
      expect(rows[0]!.description).toBe("line one\nline two");
      expect(rows[1]!.description).toBe("simple");
    });

    it("should handle quoted fields with embedded commas", async () => {
      const csvPath = writeTempCSV("commas.csv", 'id,name\n1,"Doe, Jane"\n2,"Smith, John"\n');

      const rows = await flattenBatches(streamBatchesFromFile(csvPath, { batchSize: 10 }));

      expect(rows).toHaveLength(2);
      expect(rows[0]!.name).toBe("Doe, Jane");
    });

    it("should not deadlock when consumer breaks early", async () => {
      const rows = Array.from({ length: 20 }, (_, i) => `${i + 1},Item ${i + 1}`);
      const csvPath = writeTempCSV("early-break.csv", `id,name\n${rows.join("\n")}\n`);

      const collected: Record<string, unknown>[][] = [];
      for await (const batch of streamBatchesFromFile(csvPath, { batchSize: 3 })) {
        collected.push(batch);
        if (collected.length >= 2) break; // Exit after 2 batches
      }

      // Should have exactly 2 batches (6 rows), not hang
      expect(collected).toHaveLength(2);
      expect(collected[0]).toHaveLength(3);
      expect(collected[1]).toHaveLength(3);
    });

    it("should not deadlock when consumer throws mid-stream", async () => {
      const rows = Array.from({ length: 10 }, (_, i) => `${i + 1},Item ${i + 1}`);
      const csvPath = writeTempCSV("throw-mid.csv", `id,name\n${rows.join("\n")}\n`);

      await expect(async () => {
        let count = 0;
        for await (const _batch of streamBatchesFromFile(csvPath, { batchSize: 3 })) {
          count++;
          if (count >= 2) throw new Error("Consumer error");
        }
      }).rejects.toThrow("Consumer error");
    });
  });

  describe("streamBatchesFromFile — errors", () => {
    it("should throw for unsupported file type", async () => {
      const filePath = writeTempCSV("data.json", '{"a":1}');

      await expect(flattenBatches(streamBatchesFromFile(filePath, { batchSize: 10 }))).rejects.toThrow(
        "Unsupported file type: json"
      );
    });

    it("should throw for nonexistent file", async () => {
      const fakePath = path.join(tempDir, "nonexistent.csv");

      await expect(flattenBatches(streamBatchesFromFile(fakePath, { batchSize: 10 }))).rejects.toThrow();
    });
  });

  describe("getSidecarPath", () => {
    it("should append sheet index to file path", () => {
      expect(getSidecarPath("/data/uploads/data.xlsx", 0)).toBe("/data/uploads/data.xlsx.sheet0.csv");
      expect(getSidecarPath("/data/uploads/data.xlsx", 2)).toBe("/data/uploads/data.xlsx.sheet2.csv");
    });
  });

  describe("cleanupSidecarFiles", () => {
    it("should delete existing sidecar file", () => {
      const sidecarPath = path.join(tempDir, "data.xlsx.sheet0.csv");
      fs.writeFileSync(sidecarPath, "id,name\n1,Alice\n", "utf-8");

      expect(fs.existsSync(sidecarPath)).toBe(true);

      cleanupSidecarFiles(path.join(tempDir, "data.xlsx"), 0);

      expect(fs.existsSync(sidecarPath)).toBe(false);
    });

    it("should not throw when sidecar does not exist", () => {
      const missingPath = path.join(tempDir, "nonexistent.xlsx");
      const sidecarPath = getSidecarPath(missingPath, 0);

      cleanupSidecarFiles(missingPath, 0);

      expect(fs.existsSync(sidecarPath)).toBe(false);
    });
  });

  describe("getFileRowCount", () => {
    it("should count CSV rows (excluding header)", async () => {
      const csvPath = writeTempCSV("count.csv", "id,name\n1,A\n2,B\n3,C\n");

      expect(await getFileRowCount(csvPath)).toBe(3);
    });

    it("should count CSV records with quoted multiline fields", async () => {
      const csvPath = writeTempCSV("multiline-count.csv", 'id,description\n1,"line one\nline two"\n2,"simple"\n');

      expect(await getFileRowCount(csvPath)).toBe(2);
    });

    it("should return 0 for header-only CSV", async () => {
      const csvPath = writeTempCSV("header-only.csv", "id,name\n");

      expect(await getFileRowCount(csvPath)).toBe(0);
    });

    it("should count Excel rows", async () => {
      const fixturePath = getFixturePath("events.xlsx");

      const count = await getFileRowCount(fixturePath);

      expect(count).toBeGreaterThan(0);
    });

    it("should return 0 for unsupported file type", async () => {
      const filePath = writeTempCSV("data.json", '{"a":1}');

      expect(await getFileRowCount(filePath)).toBe(0);
    });
  });
});
