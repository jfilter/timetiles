/**
 * Field pattern matching utilities.
 *
 * Provides language-aware pattern matching for detecting standard
 * event fields (title, description, timestamp, location) based on
 * column names and data characteristics.
 *
 * @module
 * @category Utilities
 */

import type { FieldMapping, FieldMappingsResult, FieldStatistics, GeoFieldMapping } from "../types";

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

/**
 * Latitude patterns for coordinate detection.
 *
 * Supports separators: underscore, space, hyphen, dot
 */
export const LATITUDE_PATTERNS = [
  /^lat(itude)?$/i,
  /^lat[_\s.-]?deg(rees)?$/i,
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
  /^lon[_\s.-]?deg(rees)?$/i,
  /^long[_\s.-]?deg(rees)?$/i,
  /^x[_\s.-]?coord(inate)?$/i,
  /^location[_\s.-]?lon(g|gitude)?$/i,
  /^geo[_\s.-]?lon(g|gitude)?$/i,
  /^decimal[_\s.-]?lon(g|gitude)?$/i,
  /^longitude[_\s.-]?decimal$/i,
  /^wgs84[_\s.-]?lon(g|gitude)?$/i,
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
export const COORDINATE_BOUNDS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
};

/**
 * Address patterns for geocoding field detection.
 *
 * Matches fields that contain textual address information suitable for geocoding.
 */
export const ADDRESS_PATTERNS = [/^(address|addr|location|place|street|city|state|zip|postal|country)/i];

type FieldType = "title" | "description" | "locationName" | "timestamp" | "location";

/**
 * Get patterns for a field type and language.
 */
const getPatterns = (fieldType: FieldType, language: string): readonly RegExp[] => {
  const typePatterns = FIELD_PATTERNS[fieldType];
  const langPatterns = typePatterns[language as keyof typeof typePatterns];
  const engPatterns = typePatterns.eng;
  return langPatterns ?? engPatterns;
};

/**
 * Calculate confidence score for a pattern match.
 */
const calculatePatternConfidence = (fieldName: string, patterns: RegExp[]): number => {
  const patternIndex = patterns.findIndex((p) => p.test(fieldName));
  if (patternIndex === -1) return 0;
  // Earlier patterns are more specific, higher score
  return 1 - patternIndex / patterns.length;
};

/**
 * Find the best matching field for a given type.
 */
const findFieldByPattern = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: readonly RegExp[],
  validateFn?: (stats: FieldStatistics) => boolean
): FieldMapping | null => {
  let bestMatch: FieldMapping | null = null;

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    const matchIndex = patterns.findIndex((p) => p.test(fieldName));

    if (matchIndex === -1) continue;
    if (validateFn && !validateFn(stats)) continue;

    const confidence = 0.5 + (1 - matchIndex / patterns.length) * 0.5;

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { path: fieldPath, confidence };
    }
  }

  return bestMatch;
};

/**
 * Validate that a field looks like it contains text content.
 */
const isTextField = (stats: FieldStatistics): boolean => {
  return (stats.typeDistribution["string"] ?? 0) > 0;
};

/**
 * Validate that a field looks like it contains date/time values.
 */
const isDateField = (stats: FieldStatistics): boolean => {
  const hasDateFormat = (stats.formats.date ?? 0) > 0 || (stats.formats.dateTime ?? 0) > 0;
  const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;
  return hasDateFormat || hasStringType;
};

/**
 * Parse a coordinate string value.
 */
const parseCoordinate = (value: string): number | null => {
  const trimmed = value.trim();
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? null : parsed;
};

/**
 * Check if a field contains valid coordinate values.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Coordinate validation requires checking multiple conditions
const isValidCoordinateField = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  const hasNumericType = (stats.typeDistribution["number"] ?? 0) > 0 || (stats.typeDistribution["integer"] ?? 0) > 0;

  if (hasNumericType && stats.numericStats) {
    return stats.numericStats.min >= bounds.min && stats.numericStats.max <= bounds.max;
  }

  const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;
  if (hasStringType && stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    let validCount = 0;
    let totalCount = 0;

    for (const sample of stats.uniqueSamples.slice(0, 10)) {
      if (typeof sample === "string" && sample.trim() !== "") {
        const parsed = parseCoordinate(sample);
        if (parsed !== null) {
          totalCount++;
          if (parsed >= bounds.min && parsed <= bounds.max) {
            validCount++;
          }
        }
      }
    }

    return totalCount > 0 && validCount / totalCount >= 0.7;
  }

  return false;
};

/**
 * Find a coordinate field (latitude or longitude).
 */
const findCoordinateField = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: RegExp[],
  bounds: { min: number; max: number }
): FieldMapping | null => {
  let bestMatch: FieldMapping | null = null;

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    const matchIndex = patterns.findIndex((p) => p.test(fieldName));

    if (matchIndex === -1) continue;
    if (!isValidCoordinateField(stats, bounds)) continue;

    const confidence = 0.5 + (1 - matchIndex / patterns.length) * 0.5;

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { path: fieldPath, confidence };
    }
  }

  return bestMatch;
};

/**
 * Check if samples contain comma-separated coordinates.
 */
const checkCommaFormat = (samples: unknown[]): { format: string; confidence: number } | null => {
  let matches = 0;
  let latLngOrder = 0;
  let lngLatOrder = 0;

  for (const sample of samples) {
    if (typeof sample !== "string") continue;
    const parts = sample.split(",").map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && parts.every((p) => !isNaN(p))) {
      matches++;
      const [first, second] = parts as [number, number];
      if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
        latLngOrder++;
      }
      if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
        lngLatOrder++;
      }
    }
  }

  if (matches === 0) return null;

  const confidence = matches / samples.length;
  if (confidence < 0.7) return null;

  const format = latLngOrder >= lngLatOrder ? "lat,lng" : "lng,lat";
  return { format, confidence };
};

/**
 * Find a combined coordinate field.
 */
const findCombinedCoordinateField = (
  fieldStats: Record<string, FieldStatistics>
): { path: string; format: string; confidence: number } | null => {
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";

    if (!COMBINED_COORDINATE_PATTERNS.some((p) => p.test(fieldName))) continue;
    if (!stats.uniqueSamples || stats.uniqueSamples.length === 0) continue;

    const samples = stats.uniqueSamples.slice(0, 10).filter((s) => s != null && s !== "");
    const formatResult = checkCommaFormat(samples);

    if (formatResult && formatResult.confidence >= 0.7) {
      return {
        path: fieldPath,
        format: formatResult.format,
        confidence: formatResult.confidence,
      };
    }
  }

  return null;
};

/**
 * Find an address/location field for geocoding.
 */
const findLocationField = (fieldStats: Record<string, FieldStatistics>): FieldMapping | null => {
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    const matchesPattern = ADDRESS_PATTERNS.some((pattern) => pattern.test(fieldName));
    const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;

    if (matchesPattern && hasStringType) {
      // Calculate confidence based on pattern match position
      const patternIndex = ADDRESS_PATTERNS.findIndex((p) => p.test(fieldName));
      const confidence = 0.5 + (1 - patternIndex / ADDRESS_PATTERNS.length) * 0.5;
      return { path: fieldPath, confidence };
    }
  }
  return null;
};

/**
 * Detect geo field mappings.
 */
export const detectGeoFields = (fieldStats: Record<string, FieldStatistics>): GeoFieldMapping | null => {
  // First try separate lat/lng fields
  const latitude = findCoordinateField(fieldStats, LATITUDE_PATTERNS, COORDINATE_BOUNDS.latitude);
  const longitude = findCoordinateField(fieldStats, LONGITUDE_PATTERNS, COORDINATE_BOUNDS.longitude);

  // Also detect location/address field for geocoding fallback
  const locationField = findLocationField(fieldStats) ?? undefined;

  if (latitude && longitude) {
    const avgConfidence = (latitude.confidence + longitude.confidence) / 2;
    return {
      type: "separate",
      confidence: avgConfidence,
      latitude,
      longitude,
      locationField,
    };
  }

  // Try combined coordinate field
  const combined = findCombinedCoordinateField(fieldStats);
  if (combined) {
    return {
      type: "combined",
      confidence: combined.confidence,
      combined: {
        path: combined.path,
        format: combined.format,
      },
      locationField,
    };
  }

  // If only one coordinate found, still return it with lower confidence
  if (latitude ?? longitude) {
    const field = latitude ?? longitude;
    return {
      type: "separate",
      confidence: (field?.confidence ?? 0) * 0.5,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      locationField,
    };
  }

  // If only location field found, return with low confidence for geocoding
  if (locationField) {
    return {
      type: "separate",
      confidence: locationField.confidence * 0.3,
      locationField,
    };
  }

  return null;
};

/**
 * Detect field mappings for all standard fields.
 *
 * @param fieldStats - Field statistics from schema builder
 * @param language - ISO 639-3 language code
 * @returns Field mappings result
 */
export const detectFieldMappings = (
  fieldStats: Record<string, FieldStatistics>,
  language: string
): FieldMappingsResult => {
  const title = findFieldByPattern(fieldStats, getPatterns("title", language), isTextField);
  const description = findFieldByPattern(fieldStats, getPatterns("description", language), isTextField);
  const timestamp = findFieldByPattern(fieldStats, getPatterns("timestamp", language), isDateField);
  const locationName = findFieldByPattern(fieldStats, getPatterns("locationName", language), isTextField);
  const geo = detectGeoFields(fieldStats);

  return {
    title,
    description,
    timestamp,
    locationName,
    geo,
  };
};
