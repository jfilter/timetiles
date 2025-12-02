/**
 * Language detection utility tests.
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  detectLanguageFromText,
  extractTextForLanguageDetection,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
} from "./language";

describe("extractTextForLanguageDetection", () => {
  it("extracts text values from sample data", () => {
    const sampleData = [
      { title: "Hello World", count: 42 },
      { title: "Test Event", count: 100 },
    ];
    const headers = ["title", "count"];

    const result = extractTextForLanguageDetection(sampleData, headers);

    expect(result).toContain("Hello World");
    expect(result).toContain("Test Event");
    expect(result).toContain("title");
    expect(result).not.toContain("42");
  });

  it("excludes non-text values", () => {
    const sampleData = [
      {
        email: "test@example.com",
        url: "https://example.com",
        date: "2024-01-15",
        coords: "52.52,13.405",
        text: "This is descriptive text",
      },
    ];
    const headers = ["email", "url", "date", "coords", "text"];

    const result = extractTextForLanguageDetection(sampleData, headers);

    expect(result).toContain("This is descriptive text");
    expect(result).not.toContain("test@example.com");
    expect(result).not.toContain("https://example.com");
    expect(result).not.toContain("52.52,13.405");
  });

  it("excludes short strings", () => {
    const sampleData = [{ id: "AB", code: "X", name: "Test Name" }];
    const headers = ["id", "code", "name"];

    const result = extractTextForLanguageDetection(sampleData, headers);

    expect(result).toContain("Test Name");
    expect(result).toContain("name");
    expect(result).not.toContain("AB");
    expect(result).not.toMatch(/\bX\b/);
  });
});

describe("detectLanguageFromText", () => {
  it("detects English text", () => {
    const text = "This is a test of the language detection system. It should correctly identify English text.";
    const result = detectLanguageFromText(text);

    expect(result.code).toBe("eng");
    expect(result.name).toBe("English");
  });

  it("detects German text", () => {
    const text =
      "Dies ist ein Test des Spracherkennungssystems. Es sollte deutschen Text korrekt erkennen.";
    const result = detectLanguageFromText(text);

    expect(result.code).toBe("deu");
    expect(result.name).toBe("German");
  });

  it("detects French text", () => {
    const text =
      "Ceci est un test du système de détection de la langue. Il devrait identifier correctement le texte français.";
    const result = detectLanguageFromText(text);

    expect(result.code).toBe("fra");
    expect(result.name).toBe("French");
  });

  it("detects Spanish text", () => {
    const text =
      "Esta es una prueba del sistema de detección de idiomas. Debería identificar correctamente el texto español.";
    const result = detectLanguageFromText(text);

    expect(result.code).toBe("spa");
    expect(result.name).toBe("Spanish");
  });

  it("returns default for text too short", () => {
    const text = "Short";
    const result = detectLanguageFromText(text);

    expect(result.code).toBe("eng");
    expect(result.isReliable).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("returns default for empty text", () => {
    const result = detectLanguageFromText("");

    expect(result.code).toBe("eng");
    expect(result.isReliable).toBe(false);
  });
});

describe("detectLanguage", () => {
  it("detects language from sample data and headers", () => {
    const sampleData = [
      { titel: "Veranstaltung im Park", beschreibung: "Eine schöne Veranstaltung im Stadtpark" },
      { titel: "Konzert im Theater", beschreibung: "Ein wunderbares Konzert mit klassischer Musik" },
    ];
    const headers = ["titel", "beschreibung"];

    const result = detectLanguage(sampleData, headers);

    expect(result.code).toBe("deu");
    expect(result.name).toBe("German");
  });

  it("defaults to English for insufficient data", () => {
    const sampleData = [{ id: "1" }, { id: "2" }];
    const headers = ["id"];

    const result = detectLanguage(sampleData, headers);

    expect(result.code).toBe("eng");
    expect(result.isReliable).toBe(false);
  });
});

describe("isSupportedLanguage", () => {
  it("returns true for supported languages", () => {
    expect(isSupportedLanguage("eng")).toBe(true);
    expect(isSupportedLanguage("deu")).toBe(true);
    expect(isSupportedLanguage("fra")).toBe(true);
    expect(isSupportedLanguage("spa")).toBe(true);
  });

  it("returns false for unsupported languages", () => {
    expect(isSupportedLanguage("jpn")).toBe(false);
    expect(isSupportedLanguage("zho")).toBe(false);
    expect(isSupportedLanguage("xyz")).toBe(false);
  });
});

describe("SUPPORTED_LANGUAGES", () => {
  it("includes expected languages", () => {
    expect(SUPPORTED_LANGUAGES).toContain("eng");
    expect(SUPPORTED_LANGUAGES).toContain("deu");
    expect(SUPPORTED_LANGUAGES).toContain("fra");
    expect(SUPPORTED_LANGUAGES).toContain("spa");
    expect(SUPPORTED_LANGUAGES).toContain("ita");
    expect(SUPPORTED_LANGUAGES).toContain("nld");
    expect(SUPPORTED_LANGUAGES).toContain("por");
  });
});

describe("LANGUAGE_NAMES", () => {
  it("has names for all supported languages", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_NAMES[lang]).toBeDefined();
      expect(typeof LANGUAGE_NAMES[lang]).toBe("string");
    }
  });

  it("includes unknown language", () => {
    expect(LANGUAGE_NAMES["und"]).toBe("Unknown");
  });
});
