/**
 * Unit tests for `detectFileTypeFromResponse`.
 *
 * Covers Content-Type header, URL extension, and content-sniffing paths.
 * Guards the regression where JSON bodies were mis-detected as CSV because
 * any JSON text contains commas and newlines.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { detectFileTypeFromResponse } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";

const URL_NO_EXT = "https://example.com/data";

describe("detectFileTypeFromResponse", () => {
  describe("content-type header", () => {
    it("returns CSV for text/csv", () => {
      expect(detectFileTypeFromResponse("text/csv", Buffer.from(""), URL_NO_EXT)).toEqual({
        mimeType: "text/csv",
        fileExtension: ".csv",
      });
    });

    it("ignores charset parameter in content-type", () => {
      expect(detectFileTypeFromResponse("text/csv; charset=utf-8", Buffer.from(""), URL_NO_EXT)).toEqual({
        mimeType: "text/csv",
        fileExtension: ".csv",
      });
    });
  });

  describe("URL extension", () => {
    it("detects .json extension when content-type is missing", () => {
      const result = detectFileTypeFromResponse(undefined, Buffer.from("{}"), "https://example.com/data.json");
      expect(result.fileExtension).toBe(".json");
    });

    it("detects .csv extension when content-type is missing", () => {
      const result = detectFileTypeFromResponse(undefined, Buffer.from("a,b\n1,2"), "https://example.com/data.csv");
      expect(result.fileExtension).toBe(".csv");
    });
  });

  describe("content sniffing (regression)", () => {
    // Regression: the previous heuristic "if text contains comma/tab/newline,
    // call it CSV" mis-detected every JSON file as CSV, because any JSON text
    // includes both. The pipeline then routed JSON through the CSV parser and
    // failed cryptically downstream.

    it("detects a JSON object as application/json", () => {
      const body = Buffer.from('{"a": 1, "b": [2, 3]}');
      const result = detectFileTypeFromResponse(undefined, body, URL_NO_EXT);
      expect(result).toEqual({ mimeType: "application/json", fileExtension: ".json" });
    });

    it("detects a JSON array as application/json", () => {
      const body = Buffer.from('[{"id": 1}, {"id": 2}]');
      const result = detectFileTypeFromResponse(undefined, body, URL_NO_EXT);
      expect(result).toEqual({ mimeType: "application/json", fileExtension: ".json" });
    });

    it("detects JSON even with leading whitespace", () => {
      const body = Buffer.from('  \n\t  {"a": 1}');
      const result = detectFileTypeFromResponse(undefined, body, URL_NO_EXT);
      expect(result.fileExtension).toBe(".json");
    });

    it("falls back to octet-stream for unknown binary (not CSV)", () => {
      // Arbitrary binary bytes: no content-type, no URL extension, not Excel
      // magic, not JSON. Must NOT be labeled CSV by heuristic.
      const body = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      const result = detectFileTypeFromResponse(undefined, body, URL_NO_EXT);
      expect(result).toEqual({ mimeType: "application/octet-stream", fileExtension: ".bin" });
    });

    it("falls back to octet-stream for text that is not JSON or tabular (not CSV)", () => {
      // Previously: any text with commas/newlines was auto-labeled CSV.
      // Now: without a mapping signal, we don't guess — surface a clear
      // downstream "unsupported file type" error instead.
      const body = Buffer.from("hello, world\nthis is a letter.\n");
      const result = detectFileTypeFromResponse(undefined, body, URL_NO_EXT);
      expect(result).toEqual({ mimeType: "application/octet-stream", fileExtension: ".bin" });
    });

    it("detects XLSX magic bytes", () => {
      // PK\x03\x04 — ZIP/XLSX magic
      const body = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const result = detectFileTypeFromResponse(undefined, body, URL_NO_EXT);
      expect(result.fileExtension).toBe(".xlsx");
    });

    it("detects XLS magic bytes", () => {
      // OLE2 compound document magic
      const body = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const result = detectFileTypeFromResponse(undefined, body, URL_NO_EXT);
      expect(result.fileExtension).toBe(".xls");
    });
  });
});
