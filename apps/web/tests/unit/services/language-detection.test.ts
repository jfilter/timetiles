/**
 * Unit tests for language detection service.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  detectLanguage,
  detectLanguageFromSamples,
  extractTextForLanguageDetection,
  isSupportedLanguage,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
} from "@/lib/services/schema-builder/language-detection";

describe("language-detection", () => {
  describe("SUPPORTED_LANGUAGES", () => {
    it("should include common European languages", () => {
      expect(SUPPORTED_LANGUAGES).toContain("eng");
      expect(SUPPORTED_LANGUAGES).toContain("deu");
      expect(SUPPORTED_LANGUAGES).toContain("fra");
      expect(SUPPORTED_LANGUAGES).toContain("spa");
    });
  });

  describe("LANGUAGE_NAMES", () => {
    it("should have human-readable names for supported languages", () => {
      expect(LANGUAGE_NAMES["eng"]).toBe("English");
      expect(LANGUAGE_NAMES["deu"]).toBe("German");
      expect(LANGUAGE_NAMES["und"]).toBe("Unknown");
    });
  });

  describe("isSupportedLanguage", () => {
    it("should return true for supported languages", () => {
      expect(isSupportedLanguage("eng")).toBe(true);
      expect(isSupportedLanguage("deu")).toBe(true);
    });

    it("should return false for unsupported languages", () => {
      expect(isSupportedLanguage("jpn")).toBe(false);
      expect(isSupportedLanguage("xxx")).toBe(false);
      expect(isSupportedLanguage("")).toBe(false);
    });
  });

  describe("extractTextForLanguageDetection", () => {
    it("should extract text from sample data", () => {
      const headers = ["title", "description"];
      const sampleData = [{ title: "Berlin Event", description: "A wonderful gathering in the city" }];
      const text = extractTextForLanguageDetection(sampleData, headers);
      expect(text).toContain("title");
      expect(text).toContain("description");
      expect(text).toContain("Berlin Event");
      expect(text).toContain("A wonderful gathering in the city");
    });

    it("should filter out email addresses", () => {
      const sampleData = [{ email: "user@example.com", name: "John Smith" }];
      const text = extractTextForLanguageDetection(sampleData, ["email", "name"]);
      expect(text).not.toContain("user@example.com");
      expect(text).toContain("John Smith");
    });

    it("should filter out URLs", () => {
      const sampleData = [{ url: "https://example.com", name: "Test Event" }];
      const text = extractTextForLanguageDetection(sampleData, ["url", "name"]);
      expect(text).not.toContain("https://example.com");
    });

    it("should filter out ISO dates", () => {
      const sampleData = [{ date: "2024-01-15", name: "Test Event" }];
      const text = extractTextForLanguageDetection(sampleData, ["date", "name"]);
      expect(text).not.toContain("2024-01-15");
    });

    it("should filter out numeric values", () => {
      const sampleData = [{ count: "42", name: "Test Event" }];
      const text = extractTextForLanguageDetection(sampleData, ["count", "name"]);
      expect(text).not.toContain("42");
    });

    it("should filter out coordinates", () => {
      const sampleData = [{ coords: "52.5200, 13.4050" }];
      const text = extractTextForLanguageDetection(sampleData, []);
      expect(text).not.toContain("52.5200");
    });

    it("should filter out UUIDs", () => {
      const sampleData = [{ id: "550e8400-e29b-41d4-a716-446655440000" }];
      const text = extractTextForLanguageDetection(sampleData, []);
      expect(text).not.toContain("550e8400");
    });

    it("should filter out short headers", () => {
      const text = extractTextForLanguageDetection([], ["id", "description"]);
      expect(text).not.toContain("id");
      expect(text).toContain("description");
    });

    it("should skip non-string values", () => {
      const sampleData = [{ count: 42, flag: true, empty: null }];
      const text = extractTextForLanguageDetection(sampleData, []);
      expect(text).toBe("");
    });

    it("should skip very short string values", () => {
      const sampleData = [{ code: "AB" }];
      const text = extractTextForLanguageDetection(sampleData, []);
      expect(text).toBe("");
    });
  });

  describe("detectLanguage", () => {
    it("should return default for short text", () => {
      const result = detectLanguage("hi");
      expect(result.code).toBe("eng");
      expect(result.confidence).toBe(0);
      expect(result.isReliable).toBe(false);
    });

    it("should detect English text", () => {
      const text = "The quick brown fox jumps over the lazy dog. This is a sample text for language detection.";
      const result = detectLanguage(text);
      expect(result.code).toBe("eng");
      expect(result.name).toBe("English");
    });

    it("should detect German text", () => {
      const text =
        "Dies ist ein Beispieltext für die Spracherkennung. Die deutsche Sprache hat viele interessante Wörter und Sätze.";
      const result = detectLanguage(text);
      expect(result.code).toBe("deu");
      expect(result.name).toBe("German");
    });

    it("should return default for empty text", () => {
      const result = detectLanguage("");
      expect(result.code).toBe("eng");
      expect(result.isReliable).toBe(false);
    });
  });

  describe("detectLanguageFromSamples", () => {
    it("should detect language from sample data", () => {
      const headers = ["title", "description"];
      const sampleData = [
        {
          title: "Summer Festival in Berlin",
          description: "Join us for a wonderful celebration of music and art in the heart of Berlin",
        },
        {
          title: "Art Exhibition Opening",
          description: "Come see the latest works from contemporary artists at the gallery",
        },
      ];
      const result = detectLanguageFromSamples(sampleData, headers);
      expect(result.code).toBe("eng");
    });

    it("should return default for empty data", () => {
      const result = detectLanguageFromSamples([], []);
      expect(result.code).toBe("eng");
      expect(result.isReliable).toBe(false);
    });
  });
});
