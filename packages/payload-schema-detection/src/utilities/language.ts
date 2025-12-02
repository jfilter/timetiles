/**
 * Language detection utilities.
 *
 * Uses the franc library to detect the language of sample data,
 * enabling language-aware field mapping detection.
 *
 * @module
 * @category Utilities
 */

import { francAll } from "franc";
import type { LanguageResult } from "../types";

/**
 * Supported languages for field mapping detection.
 */
export const SUPPORTED_LANGUAGES = ["eng", "deu", "fra", "spa", "ita", "nld", "por"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Human-readable names for supported languages.
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
 * Minimum text length required for reliable language detection.
 */
const MIN_TEXT_LENGTH = 20;

/**
 * Confidence threshold for considering detection reliable.
 */
const RELIABILITY_THRESHOLD = 0.5;

/**
 * Checks if a value looks like non-text data that should be excluded.
 */
const isNonTextValue = (value: string): boolean => {
  // Email addresses
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return true;

  // URLs
  if (/^https?:\/\//i.test(value)) return true;

  // ISO dates
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) return true;

  // Numeric values
  if (/^-?\d+(\.\d+)?$/.test(value)) return true;

  // Coordinate-like values
  if (/^-?\d+\.\d+,\s?-?\d+\.\d+$/.test(value)) return true;

  // UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return true;

  // Purely numeric with separators
  return /^[\d\s./-]+$/.test(value);
};

/**
 * Checks if a string value is useful for language detection.
 */
const isUsefulForLanguageDetection = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.length >= 3 && !isNonTextValue(trimmed);
};

/**
 * Extracts text content suitable for language detection from sample data.
 *
 * Filters out values that are not useful for language detection:
 * - Non-string values (numbers, booleans, null)
 * - Very short strings (likely IDs or codes)
 * - Email addresses, URLs, dates, coordinates, UUIDs
 *
 * @param sampleData - Array of sample data rows
 * @param headers - Column headers
 * @returns Combined text content for language detection
 */
export const extractTextForLanguageDetection = (
  sampleData: Record<string, unknown>[],
  headers: string[]
): string => {
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
 * Detects the language of text using the franc library.
 *
 * @param text - Text to analyze
 * @returns Language detection result
 */
export const detectLanguageFromText = (text: string): LanguageResult => {
  const defaultResult: LanguageResult = {
    code: "eng",
    name: "English",
    confidence: 0,
    isReliable: false,
  };

  if (text.length < MIN_TEXT_LENGTH) {
    return defaultResult;
  }

  try {
    const results = francAll(text, {
      only: [...SUPPORTED_LANGUAGES],
      minLength: MIN_TEXT_LENGTH,
    });

    const topResult = results[0];
    if (results.length === 0 || !topResult || topResult[0] === "und") {
      return defaultResult;
    }

    const code = topResult[0];
    const score = topResult[1];

    // Calculate relative confidence based on gap between top scores
    let confidence = score;
    if (results.length > 1) {
      const secondResult = results[1];
      if (secondResult) {
        const secondScore = secondResult[1];
        const gap = score - secondScore;
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
 * @param sampleData - Array of sample data rows from uploaded file
 * @param headers - Column headers from uploaded file
 * @returns Language detection result
 */
export const detectLanguage = (
  sampleData: Record<string, unknown>[],
  headers: string[]
): LanguageResult => {
  const text = extractTextForLanguageDetection(sampleData, headers);
  return detectLanguageFromText(text);
};

/**
 * Checks if a language code is supported.
 */
export const isSupportedLanguage = (code: string): code is SupportedLanguage =>
  SUPPORTED_LANGUAGES.includes(code as SupportedLanguage);
