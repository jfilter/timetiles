/**
 * Schema similarity service for comparing uploaded file schemas with existing datasets.
 *
 * Calculates weighted similarity scores to suggest matching datasets during import.
 * Used by the import wizard to help users select appropriate target datasets.
 *
 * @module
 * @category Services
 */

import type { Dataset } from "@/payload-types";

/**
 * Represents the schema of an uploaded sheet for comparison
 */
export interface UploadedSchema {
  headers: string[];
  sampleData: Record<string, unknown>[];
  rowCount: number;
}

/**
 * Represents an existing dataset's schema for comparison
 */
export interface DatasetSchema {
  datasetId: number;
  datasetName: string;
  language: string;
  fields: string[];
  fieldTypes?: Record<string, string>;
  hasGeoFields: boolean;
  hasDateFields: boolean;
}

/**
 * Result of a similarity comparison
 */
export interface SimilarityResult {
  datasetId: number;
  datasetName: string;
  score: number;
  breakdown: {
    fieldOverlap: number;
    typeCompatibility: number;
    structureSimilarity: number;
    semanticHints: number;
    languageMatch: number;
  };
  matchingFields: string[];
  missingFields: string[];
  newFields: string[];
}

/**
 * Scoring weights for similarity calculation
 */
const WEIGHTS = {
  fieldOverlap: 0.35,
  typeCompatibility: 0.25,
  structureSimilarity: 0.2,
  semanticHints: 0.15,
  languageMatch: 0.05,
} as const;

/**
 * Common field name variations for fuzzy matching
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  title: ["name", "event", "label", "heading", "subject"],
  description: ["desc", "details", "summary", "notes", "content", "text"],
  date: ["timestamp", "datetime", "time", "when", "start", "created"],
  location: ["address", "place", "venue", "city", "area", "region"],
  latitude: ["lat", "y", "coord_y"],
  longitude: ["lng", "lon", "long", "x", "coord_x"],
};

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (str1: string, str2: string): number => {
  const len1 = str1.length;
  const len2 = str2.length;

  const matrix: number[][] = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0) as number[]);

  for (let i = 0; i <= len1; i++) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      const row = matrix[i]!;
      const prevRow = matrix[i - 1]!;
      row[j] = Math.min(prevRow[j]! + 1, row[j - 1]! + 1, prevRow[j - 1]! + cost);
    }
  }

  return matrix[len1]![len2]!;
};

/**
 * Calculate string similarity (0-1) using normalized Levenshtein distance
 */
const calculateStringSimilarity = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase().replace(/[_-]/g, "");
  const s2 = str2.toLowerCase().replace(/[_-]/g, "");

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
};

/**
 * Check if two field names are synonyms
 */
const areSynonyms = (field1: string, field2: string): boolean => {
  const f1 = field1.toLowerCase();
  const f2 = field2.toLowerCase();

  for (const synonyms of Object.values(FIELD_SYNONYMS)) {
    if (synonyms.includes(f1) && synonyms.includes(f2)) {
      return true;
    }
    const baseKey = Object.keys(FIELD_SYNONYMS).find((key) => FIELD_SYNONYMS[key]?.includes(f1));
    if (baseKey && (baseKey === f2 || FIELD_SYNONYMS[baseKey]?.includes(f2))) {
      return true;
    }
  }
  return false;
};

/**
 * Find best matching field from a set of fields
 */
const findBestMatch = (field: string, candidates: string[]): { field: string; score: number } | null => {
  let bestMatch: { field: string; score: number } | null = null;

  for (const candidate of candidates) {
    // Exact match
    if (field.toLowerCase() === candidate.toLowerCase()) {
      return { field: candidate, score: 1.0 };
    }

    // Synonym match
    if (areSynonyms(field, candidate)) {
      const score = 0.9;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { field: candidate, score };
      }
      continue;
    }

    // Fuzzy match
    const similarity = calculateStringSimilarity(field, candidate);
    if (similarity >= 0.7 && (!bestMatch || similarity > bestMatch.score)) {
      bestMatch = { field: candidate, score: similarity };
    }
  }

  return bestMatch;
};

/**
 * Calculate Jaccard index between two sets
 */
const calculateJaccardIndex = (set1: Set<string>, set2: Set<string>): number => {
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
};

/**
 * Calculate field overlap score using Jaccard + fuzzy matching
 */
const calculateFieldOverlap = (
  uploadedFields: string[],
  datasetFields: string[]
): { score: number; matching: string[]; missing: string[]; new: string[] } => {
  const normalizedUploaded = uploadedFields.map((f) => f.toLowerCase());
  const normalizedDataset = datasetFields.map((f) => f.toLowerCase());

  const matching: string[] = [];
  const missing: string[] = [];
  const newFields: string[] = [];

  // Track matched dataset fields
  const matchedDatasetFields = new Set<string>();

  // Find matches for uploaded fields
  for (const field of uploadedFields) {
    const match = findBestMatch(field, datasetFields);
    if (match && match.score >= 0.7) {
      matching.push(field);
      matchedDatasetFields.add(match.field.toLowerCase());
    } else {
      newFields.push(field);
    }
  }

  // Find missing dataset fields (not matched by any uploaded field)
  for (const field of datasetFields) {
    if (!matchedDatasetFields.has(field.toLowerCase())) {
      missing.push(field);
    }
  }

  // Calculate score combining Jaccard and fuzzy matching
  const jaccardScore = calculateJaccardIndex(new Set(normalizedUploaded), new Set(normalizedDataset));

  const fuzzyMatchScore = matching.length / Math.max(uploadedFields.length, datasetFields.length, 1);

  // Weighted combination: 40% Jaccard, 60% fuzzy
  const score = jaccardScore * 0.4 + fuzzyMatchScore * 0.6;

  return { score: Math.min(score * 100, 100), matching, missing, new: newFields };
};

/**
 * Classify a single value's type
 */
const classifyValueType = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value !== "string") return "unknown";

  // String type - detect dates and numeric strings
  const dateRegex = /^\d{4}-\d{2}-\d{2}|^\d{2}[/.]\d{2}[/.]\d{4}/;
  if (dateRegex.test(value)) return "date";
  if (!isNaN(Number(value))) return "numeric_string";
  return "string";
};

/**
 * Infer field type from sample values
 */
const inferFieldType = (values: unknown[]): string => {
  const types = new Map<string, number>();

  for (const value of values) {
    const type = classifyValueType(value);
    if (type !== "null") {
      types.set(type, (types.get(type) ?? 0) + 1);
    }
  }

  // Return most common type
  let maxCount = 0;
  let dominantType = "string";
  for (const [type, count] of types) {
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  return dominantType;
};

/**
 * Calculate type compatibility score
 */
const calculateTypeCompatibility = (uploadedSchema: UploadedSchema, datasetSchema: DatasetSchema): number => {
  if (!datasetSchema.fieldTypes || Object.keys(datasetSchema.fieldTypes).length === 0) {
    return 70; // Default to 70% if no type info available
  }

  const uploadedTypes = new Map<string, string>();
  for (const header of uploadedSchema.headers) {
    const values = uploadedSchema.sampleData.map((row) => row[header]).filter((v) => v !== undefined);
    uploadedTypes.set(header.toLowerCase(), inferFieldType(values));
  }

  let compatibleCount = 0;
  let totalCompared = 0;

  for (const [field, expectedType] of Object.entries(datasetSchema.fieldTypes)) {
    const match = findBestMatch(field, uploadedSchema.headers);
    if (match) {
      const actualType = uploadedTypes.get(match.field.toLowerCase());
      if (actualType && areTypesCompatible(actualType, expectedType)) {
        compatibleCount++;
      }
      totalCompared++;
    }
  }

  if (totalCompared === 0) return 50;
  return (compatibleCount / totalCompared) * 100;
};

/**
 * Check if two types are compatible
 */
const areTypesCompatible = (type1: string, type2: string): boolean => {
  if (type1 === type2) return true;

  const compatibleGroups = [
    ["string", "date", "numeric_string"],
    ["number", "integer", "numeric_string"],
    ["boolean", "string"],
  ];

  for (const group of compatibleGroups) {
    if (group.includes(type1) && group.includes(type2)) {
      return true;
    }
  }

  return false;
};

/**
 * Calculate structure similarity (field count ratio)
 */
const calculateStructureSimilarity = (uploadedSchema: UploadedSchema, datasetSchema: DatasetSchema): number => {
  const uploadedCount = uploadedSchema.headers.length;
  const datasetCount = datasetSchema.fields.length;

  if (uploadedCount === 0 || datasetCount === 0) return 0;

  // Ratio of field counts (penalize big differences)
  const ratio = Math.min(uploadedCount, datasetCount) / Math.max(uploadedCount, datasetCount);

  return ratio * 100;
};

/**
 * Calculate semantic hints score (presence of geo/date fields)
 */
const calculateSemanticHints = (uploadedSchema: UploadedSchema, datasetSchema: DatasetSchema): number => {
  const uploadedLower = uploadedSchema.headers.map((h) => h.toLowerCase());

  // Check for geo fields
  const geoPatterns = [/lat/i, /lon/i, /lng/i, /location/i, /address/i, /coord/i];
  const hasUploadedGeo = uploadedLower.some((h) => geoPatterns.some((p) => p.test(h)));

  // Check for date fields
  const datePatterns = [/date/i, /time/i, /timestamp/i, /when/i, /created/i, /start/i];
  const hasUploadedDate = uploadedLower.some((h) => datePatterns.some((p) => p.test(h)));

  let score = 0;
  let comparisons = 0;

  // Compare geo field presence
  if (datasetSchema.hasGeoFields || hasUploadedGeo) {
    score += datasetSchema.hasGeoFields === hasUploadedGeo ? 100 : 0;
    comparisons++;
  }

  // Compare date field presence
  if (datasetSchema.hasDateFields || hasUploadedDate) {
    score += datasetSchema.hasDateFields === hasUploadedDate ? 100 : 0;
    comparisons++;
  }

  if (comparisons === 0) return 50; // Neutral if no semantic features detected
  return score / comparisons;
};

/**
 * Calculate language match score
 */
const calculateLanguageMatch = (datasetLanguage: string, detectedLanguage?: string): number => {
  if (!detectedLanguage) return 50; // Neutral if no language detected
  return datasetLanguage === detectedLanguage ? 100 : 30;
};

/**
 * Calculate overall similarity between uploaded schema and dataset schema
 */
export const calculateSchemaSimilarity = (
  uploadedSchema: UploadedSchema,
  datasetSchema: DatasetSchema,
  detectedLanguage?: string
): SimilarityResult => {
  // Calculate individual scores
  const fieldOverlapResult = calculateFieldOverlap(uploadedSchema.headers, datasetSchema.fields);
  const typeCompatibility = calculateTypeCompatibility(uploadedSchema, datasetSchema);
  const structureSimilarity = calculateStructureSimilarity(uploadedSchema, datasetSchema);
  const semanticHints = calculateSemanticHints(uploadedSchema, datasetSchema);
  const languageMatch = calculateLanguageMatch(datasetSchema.language, detectedLanguage);

  // Calculate weighted total
  const totalScore =
    fieldOverlapResult.score * WEIGHTS.fieldOverlap +
    typeCompatibility * WEIGHTS.typeCompatibility +
    structureSimilarity * WEIGHTS.structureSimilarity +
    semanticHints * WEIGHTS.semanticHints +
    languageMatch * WEIGHTS.languageMatch;

  return {
    datasetId: datasetSchema.datasetId,
    datasetName: datasetSchema.datasetName,
    score: Math.round(totalScore),
    breakdown: {
      fieldOverlap: Math.round(fieldOverlapResult.score),
      typeCompatibility: Math.round(typeCompatibility),
      structureSimilarity: Math.round(structureSimilarity),
      semanticHints: Math.round(semanticHints),
      languageMatch: Math.round(languageMatch),
    },
    matchingFields: fieldOverlapResult.matching,
    missingFields: fieldOverlapResult.missing,
    newFields: fieldOverlapResult.new,
  };
};

/**
 * Find similar datasets for an uploaded schema
 */
export const findSimilarDatasets = (
  uploadedSchema: UploadedSchema,
  datasetSchemas: DatasetSchema[],
  options: {
    minScore?: number;
    maxResults?: number;
    detectedLanguage?: string;
  } = {}
): SimilarityResult[] => {
  const { minScore = 30, maxResults = 5, detectedLanguage } = options;

  const results: SimilarityResult[] = [];

  for (const datasetSchema of datasetSchemas) {
    const similarity = calculateSchemaSimilarity(uploadedSchema, datasetSchema, detectedLanguage);
    if (similarity.score >= minScore) {
      results.push(similarity);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Limit results
  return results.slice(0, maxResults);
};

/**
 * Extract fields and types from dataset fieldMetadata
 */
const extractFieldMetadata = (
  fieldMetadata: Dataset["fieldMetadata"]
): { fields: string[]; fieldTypes: Record<string, string> } => {
  const fields: string[] = [];
  const fieldTypes: Record<string, string> = {};

  if (!fieldMetadata || typeof fieldMetadata !== "object" || Array.isArray(fieldMetadata)) {
    return { fields, fieldTypes };
  }

  for (const [field, meta] of Object.entries(fieldMetadata)) {
    fields.push(field);
    if (meta && typeof meta === "object" && "type" in meta) {
      fieldTypes[field] = String(meta.type);
    }
  }

  return { fields, fieldTypes };
};

/**
 * Add override fields to the fields array if not already present
 */
const addOverrideFields = (fields: string[], overrides: Dataset["fieldMappingOverrides"]): string[] => {
  if (!overrides) return fields;

  const overridePaths = [
    overrides.titlePath,
    overrides.descriptionPath,
    overrides.timestampPath,
    overrides.latitudePath,
    overrides.longitudePath,
    overrides.locationPath,
  ];

  for (const path of overridePaths) {
    if (path && !fields.includes(path)) {
      fields.push(path);
    }
  }

  return fields;
};

/**
 * Convert a Payload Dataset to a DatasetSchema for comparison
 */
export const datasetToSchema = (dataset: Dataset): DatasetSchema => {
  const { fields, fieldTypes } = extractFieldMetadata(dataset.fieldMetadata);
  const overrides = dataset.fieldMappingOverrides;

  // Add override fields and detect semantic fields
  const allFields = addOverrideFields(fields, overrides);
  const hasGeoFields = !!(overrides?.latitudePath ?? overrides?.longitudePath ?? overrides?.locationPath);
  const hasDateFields = !!overrides?.timestampPath;

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    language: dataset.language ?? "eng",
    fields: allFields,
    fieldTypes,
    hasGeoFields,
    hasDateFields,
  };
};
