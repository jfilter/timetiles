/* eslint-disable sonarjs/max-lines -- Multi-language field detection requires extensive pattern definitions */
/**
 * Language-aware field mapping detection for schema building.
 *
 * Provides detection of standard event fields (title, description, timestamp, geo)
 * based on dataset language. Supports multiple languages including English,
 * German, French, Spanish, Italian, Dutch, and Portuguese.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import { parseCoordinate } from "@/lib/geospatial/parsing";
import { COORDINATE_BOUNDS, LATITUDE_PATTERNS, LONGITUDE_PATTERNS } from "@/lib/geospatial/patterns";
import type { FieldStatistics } from "@/lib/types/schema-detection";
import { isValidDate } from "@/lib/utils/date";

/**
 * Field mappings detected or configured for a schema
 */
export interface FieldMappings {
  titlePath: string | null;
  descriptionPath: string | null;
  locationNamePath: string | null;
  timestampPath: string | null;
  latitudePath: string | null;
  longitudePath: string | null;
  locationPath: string | null;
}

/**
 * Language-specific field name patterns
 *
 * Patterns are ordered by specificity - more specific patterns first
 * to ensure higher confidence scores for better matches.
 */
const FIELD_PATTERNS = {
  title: {
    eng: [/^title$/i, /^name$/i, /^event.*name$/i, /^event.*title$/i, /^label$/i, /^event$/i],
    deu: [
      /^titel$/i,
      /^name$/i,
      /^bezeichnung$/i,
      /^veranstaltung.*name$/i,
      /^veranstaltung.*titel$/i,
      /^veranstaltung$/i,
    ],
    fra: [/^titre$/i, /^nom$/i, /^événement.*nom$/i, /^événement.*titre$/i, /^intitulé$/i, /^événement$/i],
    spa: [/^título$/i, /^nombre$/i, /^evento.*nombre$/i, /^evento.*título$/i, /^denominación$/i, /^evento$/i],
    ita: [/^titolo$/i, /^nome$/i, /^evento.*nome$/i, /^evento.*titolo$/i, /^denominazione$/i, /^evento$/i],
    nld: [/^titel$/i, /^naam$/i, /^evenement.*naam$/i, /^evenement.*titel$/i, /^benaming$/i, /^evenement$/i],
    por: [/^título$/i, /^nome$/i, /^evento.*nome$/i, /^evento.*título$/i, /^denominação$/i, /^evento$/i],
  },
  description: {
    eng: [/^description$/i, /^details$/i, /^summary$/i, /^notes$/i, /^text$/i, /^content$/i, /^event.*description$/i],
    deu: [
      /^beschreibung$/i,
      /^details$/i,
      /^zusammenfassung$/i,
      /^notizen$/i,
      /^text$/i,
      /^inhalt$/i,
      /^veranstaltung.*beschreibung$/i,
    ],
    fra: [
      /^description$/i,
      /^détails$/i,
      /^résumé$/i,
      /^notes$/i,
      /^texte$/i,
      /^contenu$/i,
      /^événement.*description$/i,
    ],
    spa: [
      /^descripción$/i,
      /^detalles$/i,
      /^resumen$/i,
      /^notas$/i,
      /^texto$/i,
      /^contenido$/i,
      /^evento.*descripción$/i,
    ],
    ita: [
      /^descrizione$/i,
      /^dettagli$/i,
      /^sommario$/i,
      /^note$/i,
      /^testo$/i,
      /^contenuto$/i,
      /^evento.*descrizione$/i,
    ],
    nld: [
      /^beschrijving$/i,
      /^details$/i,
      /^samenvatting$/i,
      /^notities$/i,
      /^tekst$/i,
      /^inhoud$/i,
      /^evenement.*beschrijving$/i,
    ],
    por: [/^descrição$/i, /^detalhes$/i, /^resumo$/i, /^notas$/i, /^texto$/i, /^conteúdo$/i, /^evento.*descrição$/i],
  },
  locationName: {
    eng: [
      /^venue$/i,
      /^venue.*name$/i,
      /^place$/i,
      /^place.*name$/i,
      /^location$/i,
      /^location.*name$/i,
      /^site$/i,
      /^spot$/i,
      /^where$/i,
    ],
    deu: [/^veranstaltungsort$/i, /^ort$/i, /^spielstätte$/i, /^standort$/i, /^platz$/i, /^lokalität$/i, /^wo$/i],
    fra: [/^lieu$/i, /^endroit$/i, /^place$/i, /^salle$/i, /^site$/i, /^où$/i],
    spa: [/^lugar$/i, /^sitio$/i, /^local$/i, /^sede$/i, /^recinto$/i, /^donde$/i, /^dónde$/i],
    ita: [/^luogo$/i, /^posto$/i, /^locale$/i, /^sede$/i, /^sito$/i, /^dove$/i],
    nld: [/^locatie$/i, /^plaats$/i, /^plek$/i, /^zaal$/i, /^site$/i, /^waar$/i],
    por: [/^local$/i, /^lugar$/i, /^recinto$/i, /^sede$/i, /^sítio$/i, /^onde$/i],
  },
  timestamp: {
    eng: [
      /^date$/i,
      /^timestamp$/i,
      /^datetime$/i,
      /^date.*time$/i,
      /^created.*at$/i,
      /^event.*date$/i,
      /^event.*time$/i,
      /^time$/i,
      /^when$/i,
    ],
    deu: [
      /^datum$/i,
      /^zeitstempel$/i,
      /^erstellt.*am$/i,
      /^veranstaltung.*datum$/i,
      /^veranstaltung.*zeit$/i,
      /^zeit$/i,
      /^wann$/i,
    ],
    fra: [
      /^date$/i,
      /^horodatage$/i,
      /^créé.*le$/i,
      /^événement.*date$/i,
      /^événement.*heure$/i,
      /^heure$/i,
      /^quand$/i,
    ],
    spa: [/^fecha$/i, /^timestamp$/i, /^creado.*el$/i, /^evento.*fecha$/i, /^evento.*hora$/i, /^hora$/i, /^cuándo$/i],
    ita: [/^data$/i, /^timestamp$/i, /^creato.*il$/i, /^evento.*data$/i, /^evento.*ora$/i, /^ora$/i, /^quando$/i],
    nld: [
      /^datum$/i,
      /^tijdstempel$/i,
      /^gemaakt.*op$/i,
      /^evenement.*datum$/i,
      /^evenement.*tijd$/i,
      /^tijd$/i,
      /^wanneer$/i,
    ],
    por: [/^data$/i, /^timestamp$/i, /^criado.*em$/i, /^evento.*data$/i, /^evento.*hora$/i, /^hora$/i, /^quando$/i],
  },
  location: {
    eng: [
      /^address$/i,
      /^addr$/i,
      /^location$/i,
      /^place$/i,
      /^venue$/i,
      /^city$/i,
      /^town$/i,
      /^region$/i,
      /^area$/i,
      /^street$/i,
      /^full.*address$/i,
      /^event.*location$/i,
      /^event.*address$/i,
      /^event.*place$/i,
      /^postal.*address$/i,
    ],
    deu: [
      /^adresse$/i,
      /^ort$/i,
      /^standort$/i,
      /^platz$/i,
      /^veranstaltungsort$/i,
      /^stadt$/i,
      /^region$/i,
      /^straße$/i,
      /^strasse$/i,
      /^vollständige.*adresse$/i,
      /^veranstaltung.*ort$/i,
      /^veranstaltung.*adresse$/i,
      /^postadresse$/i,
    ],
    fra: [
      /^adresse$/i,
      /^lieu$/i,
      /^emplacement$/i,
      /^place$/i,
      /^salle$/i,
      /^ville$/i,
      /^région$/i,
      /^rue$/i,
      /^adresse.*complète$/i,
      /^événement.*lieu$/i,
      /^événement.*adresse$/i,
      /^adresse.*postale$/i,
    ],
    spa: [
      /^dirección$/i,
      /^lugar$/i,
      /^ubicación$/i,
      /^sitio$/i,
      /^local$/i,
      /^ciudad$/i,
      /^región$/i,
      /^calle$/i,
      /^dirección.*completa$/i,
      /^evento.*lugar$/i,
      /^evento.*dirección$/i,
      /^dirección.*postal$/i,
    ],
    ita: [
      /^indirizzo$/i,
      /^luogo$/i,
      /^posizione$/i,
      /^posto$/i,
      /^locale$/i,
      /^città$/i,
      /^regione$/i,
      /^via$/i,
      /^indirizzo.*completo$/i,
      /^evento.*luogo$/i,
      /^evento.*indirizzo$/i,
      /^indirizzo.*postale$/i,
    ],
    nld: [
      /^adres$/i,
      /^locatie$/i,
      /^plaats$/i,
      /^plek$/i,
      /^zaal$/i,
      /^stad$/i,
      /^regio$/i,
      /^straat$/i,
      /^volledig.*adres$/i,
      /^evenement.*locatie$/i,
      /^evenement.*adres$/i,
      /^postadres$/i,
    ],
    por: [
      /^endereço$/i,
      /^local$/i,
      /^localização$/i,
      /^lugar$/i,
      /^recinto$/i,
      /^cidade$/i,
      /^região$/i,
      /^rua$/i,
      /^endereço.*completo$/i,
      /^evento.*local$/i,
      /^evento.*endereço$/i,
      /^endereço.*postal$/i,
    ],
  },
} as const;

/**
 * Detects field mappings for a dataset based on language
 *
 * @param fieldStats - Statistics for all fields in the dataset
 * @param language - ISO-639-3 language code (e.g., 'eng', 'deu', 'fra')
 * @returns Detected field mappings
 */
export const detectFieldMappings = (fieldStats: Record<string, FieldStatistics>, language: string): FieldMappings => {
  // Detect coordinate fields using geospatial patterns
  const geoFields = detectGeoFields(fieldStats);

  return {
    titlePath: detectField(fieldStats, "title", language),
    descriptionPath: detectField(fieldStats, "description", language),
    locationNamePath: detectField(fieldStats, "locationName", language),
    timestampPath: detectField(fieldStats, "timestamp", language),
    latitudePath: geoFields.latitudePath,
    longitudePath: geoFields.longitudePath,
    locationPath: geoFields.locationPath ?? detectField(fieldStats, "location", language),
  };
};

/**
 * Detects a specific field type based on language patterns
 *
 * @param fieldStats - Statistics for all fields
 * @param fieldType - Type of field to detect ('title', 'description', 'timestamp')
 * @param language - ISO-639-3 language code
 * @returns Path to detected field or null if not found
 */
const detectField = (
  fieldStats: Record<string, FieldStatistics>,
  fieldType: keyof typeof FIELD_PATTERNS,
  language: string
): string | null => {
  // Get patterns for language, fallback to English
  const primaryPatterns =
    FIELD_PATTERNS[fieldType][language as keyof typeof FIELD_PATTERNS.title] ?? FIELD_PATTERNS[fieldType].eng;

  // Try primary language patterns first
  let bestMatch = findBestMatch(fieldStats, primaryPatterns, fieldType);

  // If no match found and language is not English, try English patterns as fallback
  if (!bestMatch && language !== "eng") {
    bestMatch = findBestMatch(fieldStats, FIELD_PATTERNS[fieldType].eng, fieldType);
  }

  return bestMatch?.path ?? null;
};

/**
 * Finds the best matching field for a set of patterns
 *
 * @param fieldStats - Statistics for all fields
 * @param patterns - Patterns to match against
 * @param fieldType - Type of field to detect
 * @returns Best match with path and score, or null if no match
 */
const findBestMatch = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: readonly RegExp[],
  fieldType: keyof typeof FIELD_PATTERNS
): { path: string; score: number } | null => {
  let bestMatch: { path: string; score: number } | null = null;

  // Score each field
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";

    // Calculate pattern match score
    const patternIndex = patterns.findIndex((pattern) => pattern.test(fieldName));
    if (patternIndex === -1) continue;

    // Calculate base score from pattern match (higher for earlier/more specific patterns)
    const patternScore = 1 - patternIndex / patterns.length;
    let score = patternScore * 0.6;

    // Additional validation and scoring based on field type
    const validationScore = validateFieldType(stats, fieldType);
    if (validationScore === 0) continue; // Field doesn't meet basic requirements

    score += validationScore * 0.4;

    // Update best match
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { path: fieldPath, score };
    }
  }

  return bestMatch;
};

/**
 * Validates field statistics match the expected field type
 *
 * @param stats - Field statistics
 * @param fieldType - Expected field type
 * @returns Validation score from 0 (invalid) to 1 (perfect match)
 */
const validateFieldType = (stats: FieldStatistics, fieldType: keyof typeof FIELD_PATTERNS): number => {
  const stringPct = (stats.typeDistribution.string ?? 0) / stats.occurrences;

  switch (fieldType) {
    case "title":
      return validateTitleField(stats, stringPct);
    case "description":
      return validateDescriptionField(stats, stringPct);
    case "locationName":
      return validateLocationNameField(stats, stringPct);
    case "timestamp":
      return validateTimestampField(stats, stringPct);
    case "location":
      return validateLocationField(stats, stringPct);
    default:
      return 0;
  }
};

/**
 * Validates field as a title field
 * - Should be mostly strings
 * - Reasonable length (not too short, not too long)
 * - High coverage (few nulls)
 */
const validateTitleField = (stats: FieldStatistics, stringPct: number): number => {
  // Must be at least 80% strings
  if (stringPct < 0.8) return 0;

  // Check average length if we have string samples
  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    // Ideal title length: 10-100 characters
    if (avgLength >= 10 && avgLength <= 100) return 1.0;
    // Acceptable: 5-200 characters
    if (avgLength >= 5 && avgLength <= 200) return 0.8;
    // Too short or too long
    if (avgLength < 3 || avgLength > 500) return 0.3;
    // Marginal cases
    return 0.6;
  }

  // Default score if no samples
  return 0.5;
};

/**
 * Validates field as a description field
 * - Should be mostly strings
 * - Typically longer than titles
 * - Can have more nulls than title
 */
const validateDescriptionField = (stats: FieldStatistics, stringPct: number): number => {
  // Must be at least 70% strings (descriptions can be more often missing)
  if (stringPct < 0.7) return 0;

  // Check average length if we have string samples
  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    // Ideal description length: 20-500 characters
    if (avgLength >= 20 && avgLength <= 500) return 1.0;
    // Acceptable: 10-1000 characters
    if (avgLength >= 10 && avgLength <= 1000) return 0.8;
    // Too short
    if (avgLength < 5) return 0.2;
    // Very long (but still acceptable for descriptions)
    if (avgLength > 1000) return 0.7;
    // Marginal cases
    return 0.6;
  }

  // Default score if no samples
  return 0.5;
};

/**
 * Validates field as a location name field
 * - Should be mostly strings
 * - Typically venue names, place names, or short location descriptions
 * - Similar to title but for locations
 */
const validateLocationNameField = (stats: FieldStatistics, stringPct: number): number => {
  // Must be at least 70% strings
  if (stringPct < 0.7) return 0;

  // Check average length if we have string samples
  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    // Location names vary in length:
    // Short: "Reichstag" (9 chars)
    // Medium: "Kottbusser Platz" (16 chars)
    // Long: "Deutsches Historisches Museum" (29 chars)

    // Ideal location name length: 3-50 characters
    if (avgLength >= 3 && avgLength <= 50) return 1.0;
    // Acceptable: 2-100 characters
    if (avgLength >= 2 && avgLength <= 100) return 0.8;
    // Too short (likely codes)
    if (avgLength < 2) return 0.2;
    // Longer (might be full addresses, still acceptable)
    if (avgLength > 100) return 0.6;
    // Marginal cases
    return 0.5;
  }

  // Default score if no samples
  return 0.5;
};

/**
 * Check if field contains Date objects or ISO date strings
 */
const checkDateObjectsOrISOStrings = (stats: FieldStatistics): number => {
  const objectPct = (stats.typeDistribution.object ?? 0) / stats.occurrences;

  if (objectPct <= 0.7 || !stats.uniqueSamples || stats.uniqueSamples.length === 0) {
    return 0;
  }

  const dateObjects = stats.uniqueSamples.filter((v) => v instanceof Date);
  const isoDateStrings = stats.uniqueSamples.filter(
    (v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
  );
  const dateValueCount = dateObjects.length + isoDateStrings.length;
  const dateValuePct = dateValueCount / stats.uniqueSamples.length;

  if (dateValuePct >= 0.7) return 1.0; // High confidence
  if (dateValuePct >= 0.5) return 0.8;
  return 0;
};

/**
 * Check if field has date format indicators
 */
const checkDateFormat = (stats: FieldStatistics): number => {
  const hasDateFormat = (stats.formats?.date ?? 0) > 0 || (stats.formats?.dateTime ?? 0) > 0;

  if (!hasDateFormat) return 0;

  const dateFormatPct = ((stats.formats?.date ?? 0) + (stats.formats?.dateTime ?? 0)) / stats.occurrences;
  return Math.min(1.0, 0.7 + dateFormatPct * 0.3);
};

/**
 * Check if string values can be parsed as dates
 */
const checkParseableStrings = (stats: FieldStatistics, stringPct: number): number => {
  if (stringPct <= 0.5 || !stats.uniqueSamples || stats.uniqueSamples.length === 0) {
    return 0;
  }

  const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
  let validDateCount = 0;

  for (const value of stringValues.slice(0, 10)) {
    const date = new Date(value);
    if (isValidDate(date)) {
      validDateCount++;
    }
  }

  const validDatePct = validDateCount / Math.min(stringValues.length, 10);
  if (validDatePct >= 0.7) return 0.9;
  if (validDatePct >= 0.5) return 0.7;
  if (validDatePct >= 0.3) return 0.5;
  return 0;
};

/**
 * Check if numeric values are unix timestamps
 */
const checkUnixTimestamp = (stats: FieldStatistics): number => {
  const hasNumericType = (stats.typeDistribution.number ?? 0) > 0 || (stats.typeDistribution.integer ?? 0) > 0;

  if (!hasNumericType || !stats.numericStats) return 0;

  // Unix timestamps are typically > 1000000000 (Sep 2001)
  if (stats.numericStats.min > 1000000000 && stats.numericStats.max < 9999999999) {
    return 0.8; // Likely unix timestamp in seconds
  }
  if (stats.numericStats.min > 1000000000000 && stats.numericStats.max < 9999999999999) {
    return 0.8; // Likely unix timestamp in milliseconds
  }
  return 0;
};

/**
 * Validates field as a timestamp field
 * - Should be date format or parseable as date
 * - Can be string or number
 */
const validateTimestampField = (stats: FieldStatistics, stringPct: number): number => {
  // Check Date objects/ISO strings first (highest confidence)
  const dateObjectScore = checkDateObjectsOrISOStrings(stats);
  if (dateObjectScore > 0) return dateObjectScore;

  // Check date format
  const dateFormatScore = checkDateFormat(stats);
  if (dateFormatScore > 0) return dateFormatScore;

  // Check parseable strings
  const parseableScore = checkParseableStrings(stats, stringPct);
  if (parseableScore > 0) return parseableScore;

  // Check unix timestamps
  const unixTimestampScore = checkUnixTimestamp(stats);
  if (unixTimestampScore > 0) return unixTimestampScore;

  // No clear date indicators
  return 0;
};

/**
 * Validates field as a location field
 * - Should be mostly strings
 * - Can be addresses, cities, or any location text
 * - More flexible than title/description
 */
const validateLocationField = (stats: FieldStatistics, stringPct: number): number => {
  // Must be at least 70% strings (locations are typically text)
  if (stringPct < 0.7) return 0;

  // Check average length if we have string samples
  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    // Location fields can vary widely in length
    // Cities: "Berlin" (6 chars)
    // Addresses: "123 Main St, NYC, NY 10001" (27 chars)
    // Landmarks: "Eiffel Tower, Paris" (20 chars)

    // Ideal location length: 3-100 characters
    if (avgLength >= 3 && avgLength <= 100) return 1.0;
    // Acceptable: 2-500 characters
    if (avgLength >= 2 && avgLength <= 500) return 0.8;
    // Too short (likely codes not locations)
    if (avgLength < 2) return 0.2;
    // Very long (but still acceptable for full addresses)
    if (avgLength > 500) return 0.6;
    // Marginal cases
    return 0.5;
  }

  // Default score if no samples
  return 0.5;
};

/**
 * Helper to check if numeric field is valid coordinate
 */
const isValidNumericCoordinate = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  const hasNumericType = (stats.typeDistribution.number ?? 0) > 0 || (stats.typeDistribution.integer ?? 0) > 0;
  return (
    hasNumericType &&
    stats.numericStats !== undefined &&
    stats.numericStats.min >= bounds.min &&
    stats.numericStats.max <= bounds.max
  );
};

/**
 * Helper to check if string field contains parseable coordinates
 */
const isValidStringCoordinate = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  const hasStringType = (stats.typeDistribution.string ?? 0) > 0;
  if (!hasStringType || !stats.uniqueSamples || stats.uniqueSamples.length === 0) {
    return false;
  }

  let validParsedCount = 0;
  let totalParsed = 0;

  for (const sample of stats.uniqueSamples.slice(0, 10)) {
    if (typeof sample === "string" && sample.trim() !== "") {
      const parsed = parseCoordinate(sample);
      if (parsed !== null) {
        totalParsed++;
        if (parsed >= bounds.min && parsed <= bounds.max) {
          validParsedCount++;
        }
      }
    }
  }

  // If at least 70% of parsed samples are within bounds, consider it valid
  return totalParsed > 0 && validParsedCount / totalParsed >= 0.7;
};

/**
 * Check if a field contains valid coordinate values
 */
const isValidCoordinateField = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  return isValidNumericCoordinate(stats, bounds) || isValidStringCoordinate(stats, bounds);
};

/**
 * Calculate pattern match confidence for coordinate detection (0.4 points max)
 */
const calculatePatternConfidence = (fieldName: string, patterns: RegExp[]): number => {
  const patternMatch = patterns.findIndex((p) => p.test(fieldName));
  if (patternMatch === -1) return 0;
  // Earlier patterns in the list are more specific, so they get higher scores
  const patternScore = 1 - patternMatch / patterns.length;
  return patternScore * 0.4;
};

/**
 * Calculate data type validity confidence for coordinates (0.3 points max)
 */
const calculateTypeConfidence = (stats: FieldStatistics, bounds: { min: number; max: number }): number => {
  const hasNumericType = (stats.typeDistribution.number ?? 0) > 0 || (stats.typeDistribution.integer ?? 0) > 0;
  const hasStringType = (stats.typeDistribution.string ?? 0) > 0;

  if (hasNumericType && stats.numericStats) {
    const inBounds = stats.numericStats.min >= bounds.min && stats.numericStats.max <= bounds.max;
    return inBounds ? 0.3 : 0;
  }

  if (hasStringType && stats.uniqueSamples) {
    let validCount = 0;
    let totalCount = 0;
    for (const sample of stats.uniqueSamples.slice(0, 10)) {
      if (typeof sample === "string" && sample.trim() !== "") {
        totalCount++;
        const parsed = parseCoordinate(sample);
        if (parsed !== null && parsed >= bounds.min && parsed <= bounds.max) {
          validCount++;
        }
      }
    }
    return totalCount > 0 ? (validCount / totalCount) * 0.3 : 0;
  }

  return 0;
};

/**
 * Calculate confidence score for a coordinate field.
 * Returns a score between 0 and 1 based on multiple factors.
 */
const calculateFieldConfidence = (
  stats: FieldStatistics,
  patterns: RegExp[],
  bounds: { min: number; max: number }
): number => {
  const fieldName = stats.path.split(".").pop() ?? "";

  // Factor 1: Pattern match quality (0.4 points)
  const patternConfidence = calculatePatternConfidence(fieldName, patterns);

  // Factor 2: Data type validity (0.3 points)
  const typeConfidence = calculateTypeConfidence(stats, bounds);

  // Factor 3: Data consistency (0.2 points)
  const totalTypes = Object.values(stats.typeDistribution).reduce((sum, count) => sum + count, 0);
  const dominantType = Math.max(...Object.values(stats.typeDistribution));
  const consistencyRatio = dominantType / totalTypes;
  const consistencyConfidence = consistencyRatio * 0.2;

  // Factor 4: Completeness (0.1 points)
  const completenessRatio = (stats.occurrences - stats.nullCount) / stats.occurrences;
  const completenessConfidence = completenessRatio * 0.1;

  return patternConfidence + typeConfidence + consistencyConfidence + completenessConfidence;
};

/**
 * Find best matching coordinate field for given patterns and bounds
 */
const findCoordinateField = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: RegExp[],
  bounds: { min: number; max: number }
): string | null => {
  let bestField: string | null = null;
  let bestConfidence = 0;

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    if (patterns.some((p) => p.test(fieldName)) && isValidCoordinateField(stats, bounds)) {
      const confidence = calculateFieldConfidence(stats, patterns, bounds);
      if (confidence > bestConfidence) {
        bestField = fieldPath;
        bestConfidence = confidence;
      }
    }
  }

  return bestField;
};

/**
 * Detects geographic fields including coordinates and location text
 *
 * @param fieldStats - Statistics for all fields in the dataset
 * @returns Detected geo field mappings
 */
const detectGeoFields = (
  fieldStats: Record<string, FieldStatistics>
): {
  latitudePath: string | null;
  longitudePath: string | null;
  locationPath: string | null;
} => {
  // Try to find separate lat/lon fields using specialized geospatial patterns
  const latitudePath = findCoordinateField(fieldStats, LATITUDE_PATTERNS, COORDINATE_BOUNDS.latitude);
  const longitudePath = findCoordinateField(fieldStats, LONGITUDE_PATTERNS, COORDINATE_BOUNDS.longitude);

  // Location field will be detected by language patterns in the main detectFieldMappings function
  return {
    latitudePath,
    longitudePath,
    locationPath: null, // Will be filled by language-aware detection
  };
};
