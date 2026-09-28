/**
 * Validating the generated Payload files must report drift without leaving the
 * regenerated files or any backup behind.
 *
 * @module
 * @category Tests
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findOutOfSyncFiles } from "@/scripts/validate-types";

describe("findOutOfSyncFiles", () => {
  let dir: string;
  let files: { file: string; label: string }[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-types-"));
    files = [
      { file: path.join(dir, "types.ts"), label: "Types" },
      { file: path.join(dir, "schema.ts"), label: "Database schema" },
    ];
    fs.writeFileSync(files[0]!.file, "export type A = 1;\n");
    fs.writeFileSync(files[1]!.file, "export const s = 1;\n");
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("reports nothing when generation reproduces the committed files", () => {
    expect(
      findOutOfSyncFiles(() => files.forEach(({ file }) => fs.writeFileSync(file, fs.readFileSync(file))), files)
    ).toEqual([]);
    expect(new Set(fs.readdirSync(dir))).toEqual(new Set(["schema.ts", "types.ts"]));
  });

  it("names a drifted file and restores its committed content", () => {
    const drifted = findOutOfSyncFiles(() => fs.writeFileSync(files[0]!.file, "export type A = 2;\n"), files);

    expect(drifted).toEqual([files[0]!.file]);
    expect(fs.readFileSync(files[0]!.file, "utf8")).toBe("export type A = 1;\n");
    expect(new Set(fs.readdirSync(dir))).toEqual(new Set(["schema.ts", "types.ts"]));
  });

  it("counts a file generation creates but nobody committed as drift and removes it", () => {
    fs.rmSync(files[1]!.file);

    const drifted = findOutOfSyncFiles(() => fs.writeFileSync(files[1]!.file, "export const s = 1;\n"), files);

    expect(drifted).toEqual([files[1]!.file]);
    expect(fs.readdirSync(dir)).toEqual(["types.ts"]);
  });

  it("restores the committed files when generation fails halfway", () => {
    const failing = () => {
      fs.writeFileSync(files[0]!.file, "partial");
      throw new Error("generate failed");
    };

    expect(() => findOutOfSyncFiles(failing, files)).toThrow("generate failed");
    expect(fs.readFileSync(files[0]!.file, "utf8")).toBe("export type A = 1;\n");
  });
});
