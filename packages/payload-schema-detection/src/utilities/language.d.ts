/**
 * Language detection utilities.
 *
 * Uses the franc library to detect the language of sample data,
 * enabling language-aware field mapping detection.
 *
 * @module
 * @category Utilities
 */
import type { LanguageResult } from "../types";
/**
 * Supported languages for field mapping detection.
 */
export declare const SUPPORTED_LANGUAGES: readonly ["eng", "deu", "fra", "spa", "ita", "nld", "por"];
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
/**
 * Human-readable names for supported languages.
 */
export declare const LANGUAGE_NAMES: Record<string, string>;
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
export declare const extractTextForLanguageDetection: (sampleData: Record<string, unknown>[], headers: string[]) => string;
/**
 * Detects the language of text using the franc library.
 *
 * @param text - Text to analyze
 * @returns Language detection result
 */
export declare const detectLanguageFromText: (text: string) => LanguageResult;
/**
 * Detects language from sample data and headers.
 *
 * @param sampleData - Array of sample data rows from uploaded file
 * @param headers - Column headers from uploaded file
 * @returns Language detection result
 */
export declare const detectLanguage: (sampleData: Record<string, unknown>[], headers: string[]) => LanguageResult;
/**
 * Checks if a language code is supported.
 */
export declare const isSupportedLanguage: (code: string) => code is SupportedLanguage;
//# sourceMappingURL=language.d.ts.map