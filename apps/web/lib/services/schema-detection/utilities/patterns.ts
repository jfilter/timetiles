/**
 * Field pattern matching utilities.
 *
 * Provides language-aware pattern matching for detecting standard
 * event fields (title, description, start/end timestamps, location) based on
 * column names and data characteristics.
 *
 * @module
 * @category Utilities
 */

import type { DetectionOptions, FieldMapping, FieldMappingsResult, FieldStatistics, GeoFieldMapping } from "../types";
import { validateFieldType } from "./validators";

// ---------------------------------------------------------------------------
// Field name patterns
// ---------------------------------------------------------------------------

/**
 * Language-specific field name patterns.
 *
 * Patterns are ordered by specificity - more specific patterns first
 * to ensure higher confidence scores for better matches.
 */
export const FIELD_PATTERNS = {
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
  endTimestamp: {
    eng: [
      /^end[_\s.-]?date$/i,
      /^end[_\s.-]?time$/i,
      /^end[_\s.-]?datetime$/i,
      /^date[_\s.-]?end$/i,
      /^time[_\s.-]?end$/i,
      /^ends?[_\s.-]?at$/i,
      /^finish(?:es|ed)?[_\s.-]?(?:at|date|time)?$/i,
      /^until$/i,
    ],
    deu: [
      /^enddatum$/i,
      /^endzeit$/i,
      /^ende$/i,
      /^datum[_\s.-]?ende$/i,
      /^zeit[_\s.-]?ende$/i,
      /^veranstaltung.*ende$/i,
      /^bis$/i,
    ],
    fra: [/^date[_\s.-]?fin$/i, /^heure[_\s.-]?fin$/i, /^fin$/i, /^événement.*fin$/i, /^jusqu.?à$/i],
    spa: [/^fecha[_\s.-]?fin$/i, /^hora[_\s.-]?fin$/i, /^fin$/i, /^evento.*fin$/i, /^hasta$/i],
    ita: [/^data[_\s.-]?fine$/i, /^ora[_\s.-]?fine$/i, /^fine$/i, /^evento.*fine$/i, /^fino.*a$/i],
    nld: [/^eind[_\s.-]?datum$/i, /^eind[_\s.-]?tijd$/i, /^einde$/i, /^evenement.*einde$/i, /^tot$/i],
    por: [/^data[_\s.-]?fim$/i, /^hora[_\s.-]?fim$/i, /^fim$/i, /^evento.*fim$/i, /^até$/i],
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

// ---------------------------------------------------------------------------
// Coordinate patterns
// ---------------------------------------------------------------------------

/**
 * Latitude patterns for coordinate detection.
 *
 * Supports separators: underscore, space, hyphen, dot
 */
export const LATITUDE_PATTERNS = [
  /^lat(itude)?$/i,
  /^lat[_\s.-]?deg(rees)?$/i,
  /^lat[_\s.-]?coord(inate)?$/i,
  /^y[_\s.-]?coord(inate)?$/i,
  /^location[_\s.-]?lat(itude)?$/i,
  /^geo[_\s.-]?lat(itude)?$/i,
  /^decimal[_\s.-]?lat(itude)?$/i,
  /^latitude[_\s.-]?decimal$/i,
  /^wgs84[_\s.-]?lat(itude)?$/i,
  /^breite$/i, // German
  /^breitengrad$/i, // German
];

/**
 * Longitude patterns for coordinate detection.
 *
 * Supports separators: underscore, space, hyphen, dot
 */
export const LONGITUDE_PATTERNS = [
  /^lon(g|gitude)?$/i,
  /^lng$/i,
  /^(lon(g)?|lng)[_\s.-]?deg(rees)?$/i,
  /^(lon(g)?|lng)[_\s.-]?coord(inate)?$/i,
  /^x[_\s.-]?coord(inate)?$/i,
  /^location[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^geo[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^decimal[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^(longitude|lng)[_\s.-]?decimal$/i,
  /^wgs84[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^länge$/i, // German
  /^laenge$/i, // German (ASCII)
  /^längengrad$/i, // German
];

/**
 * Combined coordinate patterns.
 *
 * Recognizes fields that contain both latitude and longitude in a single value.
 */
export const COMBINED_COORDINATE_PATTERNS = [
  /^coord(inate)?s?$/i,
  /^lat[_\s.-]?lon(g)?$/i,
  /^location$/i,
  /^geo[_\s.-]?location$/i,
  /^position$/i,
  /^point$/i,
  /^geometry$/i,
  /^geo$/i,
  /^geolocation$/i,
  /^geo[_\s.-]?point$/i,
  /^latlng$/i,
  /^lat[_\s.-]?lng$/i,
  /^lnglat$/i,
  /^lng[_\s.-]?lat$/i,
  /^koordinaten$/i, // German
];

/**
 * Valid coordinate bounds.
 */
export const COORDINATE_BOUNDS = { latitude: { min: -90, max: 90 }, longitude: { min: -180, max: 180 } };

/**
 * Address patterns for geocoding field detection.
 *
 * Matches fields that contain textual address information suitable for geocoding.
 */
export const ADDRESS_PATTERNS = [/^(address|addr|location|place|street|city|state|zip|postal|country)/i];

type FieldType = "title" | "description" | "locationName" | "timestamp" | "endTimestamp" | "location";

/** Result of matching a name against field patterns. */
export interface FieldPatternMatch {
  /** The name that matched */
  name: string;
  /** Index of the matched pattern (lower = more specific) */
  patternIndex: number;
  /** Total patterns checked */
  patternCount: number;
  /** Whether the match came from the primary language or the English fallback */
  isFallback: boolean;
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Match a list of field/column names against FIELD_PATTERNS for a given field type and language.
 *
 * Tries language-specific patterns first, then falls back to English.
 * Returns the first (most specific) match found, or null if no match.
 *
 * Used by both preview-time detection and background job detection to ensure
 * the pattern-matching portion of field detection uses consistent logic.
 */
export const matchFieldNamePatterns = (
  names: string[],
  fieldType: FieldType,
  language: string
): FieldPatternMatch | null => {
  const primaryPatterns = getFieldPatterns(fieldType, language);

  // Try primary language patterns
  for (let i = 0; i < primaryPatterns.length; i++) {
    const pattern = primaryPatterns[i];
    if (!pattern) continue;
    const match = names.find((n) => pattern.test(n));
    if (match) {
      return { name: match, patternIndex: i, patternCount: primaryPatterns.length, isFallback: false };
    }
  }

  // Fallback to English if primary language isn't English
  if (language !== "eng") {
    const engPatterns = getFieldPatterns(fieldType, "eng");
    for (let i = 0; i < engPatterns.length; i++) {
      const pattern = engPatterns[i];
      if (!pattern) continue;
      const match = names.find((n) => pattern.test(n));
      if (match) {
        return { name: match, patternIndex: i, patternCount: engPatterns.length, isFallback: true };
      }
    }
  }

  return null;
};

/**
 * Get patterns for a field type and language, falling back to English.
 *
 * When options provide fieldPatterns for the given field type and language,
 * they are prepended to defaults (or replace them if the field type is in replacePatterns).
 *
 * Single source of truth for pattern selection.
 */
export const getFieldPatterns = (
  fieldType: string,
  language: string,
  options?: DetectionOptions
): readonly RegExp[] => {
  // For standard field types, use the built-in FIELD_PATTERNS
  const builtinType = FIELD_PATTERNS[fieldType as FieldType];
  const defaultPatterns: readonly RegExp[] = builtinType
    ? ((builtinType[language as keyof typeof builtinType] ?? builtinType.eng) as readonly RegExp[])
    : [];

  // Check for custom patterns from options
  const customPatterns = options?.fieldPatterns?.[fieldType]?.[language];
  if (!customPatterns) return defaultPatterns;

  // Replace or prepend
  if (options?.replacePatterns?.includes(fieldType)) {
    return customPatterns;
  }
  return [...defaultPatterns, ...customPatterns];
};

// ---------------------------------------------------------------------------
// Field matching with combined pattern + validation scoring
// ---------------------------------------------------------------------------

/**
 * Finds the best matching field for a set of patterns using combined scoring.
 *
 * Scores each field using pattern position (60%) and statistical
 * validation (40%) to find the most likely match. Fields where
 * validation returns 0 are skipped.
 */
const findFieldByPattern = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: readonly RegExp[],
  fieldType: string,
  options?: DetectionOptions
): FieldMapping | null => {
  let bestMatch: FieldMapping | null = null;

  const [patternWeight, validationWeight] = options?.scoringWeights ?? [0.6, 0.4];

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    const patternIndex = patterns.findIndex((p) => p.test(fieldName));

    if (patternIndex === -1) continue;

    const patternScore = 1 - patternIndex / patterns.length;
    const validationScore = validateFieldType(
      stats,
      fieldType,
      options?.validatorOverrides?.[fieldType],
      options?.customValidators?.[fieldType]
    );
    if (validationScore === 0) continue;

    const confidence = patternScore * patternWeight + validationScore * validationWeight;

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { path: fieldPath, confidence };
    }
  }

  return bestMatch;
};

// oxlint-disable-next-line import/no-cycle -- Constants-only cycle with coordinates.ts; no runtime risk
import { detectGeoFields } from "./coordinates";

// ---------------------------------------------------------------------------
// Field mapping detection
// ---------------------------------------------------------------------------

/**
 * Find the best field match, trying primary language patterns first then English fallback.
 */
const findFieldWithFallback = (
  fieldStats: Record<string, FieldStatistics>,
  fieldType: string,
  language: string,
  options?: DetectionOptions
): FieldMapping | null => {
  const match = findFieldByPattern(fieldStats, getFieldPatterns(fieldType, language, options), fieldType, options);
  if (match) return match;
  // Fallback to English if primary language didn't match
  if (language !== "eng") {
    return findFieldByPattern(fieldStats, getFieldPatterns(fieldType, "eng", options), fieldType, options);
  }
  return null;
};

/**
 * Detect field mappings for all standard fields (structured result with confidence).
 *
 * @param fieldStats - Field statistics from schema builder
 * @param language - ISO 639-3 language code
 * @param options - Optional detection options for customizing behavior
 * @returns Field mappings result with confidence scores
 */
export const detectFieldMappings = (
  fieldStats: Record<string, FieldStatistics>,
  language: string,
  options?: DetectionOptions
): FieldMappingsResult => {
  // Skip all field mapping if requested
  if (options?.skip?.fieldMapping) {
    return { title: null, description: null, timestamp: null, endTimestamp: null, locationName: null, geo: null };
  }

  const title = findFieldWithFallback(fieldStats, "title", language, options);
  const description = findFieldWithFallback(fieldStats, "description", language, options);
  const timestamp = findFieldWithFallback(fieldStats, "timestamp", language, options);
  const endTimestamp = findFieldWithFallback(fieldStats, "endTimestamp", language, options);
  const locationName = findFieldWithFallback(fieldStats, "locationName", language, options);
  const geo = options?.skip?.coordinates ? null : detectGeoFields(fieldStats, options);

  // Use an intersection so additional field types can be added dynamically
  const result: FieldMappingsResult & Record<string, FieldMapping | GeoFieldMapping | null> = {
    title,
    description,
    timestamp,
    endTimestamp,
    locationName,
    geo,
  };

  // Detect additional field types if configured
  if (options?.additionalFieldTypes) {
    for (const [typeName, typeConfig] of Object.entries(options.additionalFieldTypes)) {
      const additionalOptions: DetectionOptions = {
        ...options,
        fieldPatterns: { ...options.fieldPatterns, [typeName]: typeConfig.patterns },
        customValidators: { ...options.customValidators, [typeName]: typeConfig.validator },
      };
      result[typeName] = findFieldWithFallback(fieldStats, typeName, language, additionalOptions);
    }
  }

  return result;
};
