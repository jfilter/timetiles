/**
 * Language detection service for import wizard.
 *
 * Uses the franc library to detect the language of sample data,
 * enabling language-aware field mapping detection.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import { francAll } from "franc";

/**
 * Supported languages for field mapping detection.
 * These must match the languages defined in FIELD_PATTERNS in field-mapping-detection.ts
 */
export const SUPPORTED_LANGUAGES = ["eng", "deu", "fra", "spa", "ita", "nld", "por"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Human-readable names for supported languages
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  eng: "English",
  deu: "German",
  fra: "French",
  spa: "Spanish",
  ita: "Italian",
  nld: "Dutch",
  por: "Portuguese",
  und: "Unknown",
};

/**
 * Result of language detection
 */
export interface LanguageDetectionResult {
  /** ISO 639-3 language code (e.g., 'eng', 'deu', 'fra') */
  code: string;
  /** Human-readable language name */
  name: string;
  /** Confidence score from 0-1 */
  confidence: number;
  /** Whether the detection is considered reliable (confidence > 0.5) */
  isReliable: boolean;
}

/**
 * Minimum text length required for reliable language detection.
 * Shorter text tends to produce unreliable results.
 */
const MIN_TEXT_LENGTH = 20;

/**
 * Confidence threshold for considering detection reliable.
 */
const RELIABILITY_THRESHOLD = 0.5;

/**
 * Extracts text content suitable for language detection from sample data.
 *
 * Filters out values that are not useful for language detection:
 * - Non-string values (numbers, booleans, null)
 * - Very short strings (likely IDs or codes)
 * - Email addresses
 * - URLs
 * - ISO dates
 * - Coordinate-like numbers
 *
 * @param sampleData - Array of sample data rows
 * @param headers - Column headers
 * @returns Combined text content for language detection
 */
export const extractTextForLanguageDetection = (sampleData: Record<string, unknown>[], headers: string[]): string => {
  const textParts: string[] = [];

  // Include headers as they often contain language-specific terms
  textParts.push(...headers.filter((h) => h.length > 2 && !isNonTextValue(h)));

  // Extract text values from sample data
  for (const row of sampleData) {
    for (const value of Object.values(row)) {
      if (typeof value === "string" && isUsefulForLanguageDetection(value)) {
        textParts.push(value);
      }
    }
  }

  return textParts.join(" ");
};

/**
 * Checks if a string value is useful for language detection.
 */
const isUsefulForLanguageDetection = (value: string): boolean => {
  const trimmed = value.trim();

  // Too short (likely code/abbreviation) or non-text data
  return trimmed.length >= 3 && !isNonTextValue(trimmed);
};

/**
 * Checks if a value looks like non-text data that should be excluded.
 */
const isNonTextValue = (value: string): boolean => {
  // Email addresses (simplified pattern - avoid catastrophic backtracking)
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return true;

  // URLs
  if (/^https?:\/\//i.test(value)) return true;

  // ISO dates - pattern is bounded, safe from backtracking
  // eslint-disable-next-line security/detect-unsafe-regex
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) return true;

  // Numeric values (possibly with decimal point or negative sign) - bounded
  // eslint-disable-next-line security/detect-unsafe-regex
  if (/^-?\d+(\.\d+)?$/.test(value)) return true;

  // Coordinate-like values (e.g., "52.5200, 13.4050")
  if (/^-?\d+\.\d+,\s?-?\d+\.\d+$/.test(value)) return true;

  // UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return true;

  // Purely numeric with separators (IDs, phone numbers, etc.)
  return /^[\d\s./-]+$/.test(value);
};

/**
 * Detects the language of text using the franc library.
 *
 * @param text - Text to analyze
 * @returns Language detection result
 */
export const detectLanguage = (text: string): LanguageDetectionResult => {
  // Default result for when detection fails
  const defaultResult: LanguageDetectionResult = {
    code: "eng",
    name: "English",
    confidence: 0,
    isReliable: false,
  };

  // Not enough text for reliable detection
  if (text.length < MIN_TEXT_LENGTH) {
    return defaultResult;
  }

  try {
    // Get all language possibilities with scores
    const results = francAll(text, {
      only: [...SUPPORTED_LANGUAGES],
      minLength: MIN_TEXT_LENGTH,
    });

    // franc returns 'und' (undefined) when it can't detect
    const topResult = results[0];
    if (results.length === 0 || !topResult || topResult[0] === "und") {
      return defaultResult;
    }

    // Get top result
    const code = topResult[0];
    const score = topResult[1];

    // Calculate relative confidence based on gap between top scores
    let confidence = score;

    // If there's a second result, factor in the gap
    if (results.length > 1) {
      const secondResult = results[1];
      if (secondResult) {
        const secondScore = secondResult[1];
        const gap = score - secondScore;
        // Higher gap = more confidence
        confidence = Math.min(1, score + gap * 0.5);
      }
    }

    return {
      code,
      name: LANGUAGE_NAMES[code] ?? code,
      confidence,
      isReliable: confidence >= RELIABILITY_THRESHOLD,
    };
  } catch {
    return defaultResult;
  }
};

/**
 * Detects language from sample data and headers.
 *
 * This is the main entry point for language detection in the import wizard.
 *
 * @param sampleData - Array of sample data rows from uploaded file
 * @param headers - Column headers from uploaded file
 * @returns Language detection result
 */
export const detectLanguageFromSamples = (
  sampleData: Record<string, unknown>[],
  headers: string[]
): LanguageDetectionResult => {
  const text = extractTextForLanguageDetection(sampleData, headers);
  return detectLanguage(text);
};

/**
 * Checks if a language code is supported.
 */
export const isSupportedLanguage = (code: string): code is SupportedLanguage =>
  SUPPORTED_LANGUAGES.includes(code as SupportedLanguage);
