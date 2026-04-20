/**
 * Heuristics for inferring paired start/end date fields.
 *
 * Applies whole-row evidence to determine whether two date-like columns
 * represent a start/end pair, while keeping explicit mappings higher priority.
 *
 * @module
 * @category Utilities
 */

import { parseDateInput } from "@/lib/utils/date";
import { getByPathOrKey } from "@/lib/utils/object-path";

import type { FieldStatistics } from "../types";
import { validateFieldType } from "./validators";

const DEFAULT_MIN_COMPARABLE_ROWS = 3;
const DEFAULT_MIN_ORDER_AGREEMENT = 0.8;
const DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.9;

type DatePairConfidenceLevel = "high" | "medium" | "none";

export interface ExistingDateMappings {
  timestampPath?: string | null;
  endTimestampPath?: string | null;
}

export interface PairedDateInferenceOptions {
  headers: string[];
  fieldStats: Record<string, FieldStatistics>;
  existingMappings?: ExistingDateMappings;
  reservedPaths?: Iterable<string | null | undefined>;
  idFields?: Iterable<string>;
  minimumComparableRows?: number;
  minimumOrderAgreement?: number;
  highConfidenceThreshold?: number;
}

export interface PairedDateInferenceResult {
  timestampPath: string | null;
  endTimestampPath: string | null;
  confidence: number;
  confidenceLevel: DatePairConfidenceLevel;
  comparableRows: number;
  agreement: number;
}

interface CandidatePairMetrics {
  startPath: string;
  endPath: string;
  startIndex: number;
  endIndex: number;
  startValidity: number;
  endValidity: number;
  rowsWithParseableValue: number;
  comparableRows: number;
  orderedRows: number;
}

type ParseableDateInput = string | number | Date | null | undefined;

const isDateParseable = (value: unknown): boolean => parseDateInput(value as ParseableDateInput) !== null;

const uniquePathsInOrder = (
  headers: string[],
  fieldStats: Record<string, FieldStatistics>,
  anchoredPaths: string[]
): string[] => {
  const orderedPaths: string[] = [];
  const seen = new Set<string>();

  for (const path of [...headers, ...Object.keys(fieldStats), ...anchoredPaths]) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    orderedPaths.push(path);
  }

  return orderedPaths;
};

const buildCandidatePairs = (
  orderedPaths: string[],
  fieldStats: Record<string, FieldStatistics>,
  existingMappings: ExistingDateMappings,
  reservedPaths: Set<string>
): CandidatePairMetrics[] => {
  const explicitTimestampPath = existingMappings.timestampPath ?? null;
  const explicitEndTimestampPath = existingMappings.endTimestampPath ?? null;

  if (explicitTimestampPath && explicitEndTimestampPath) {
    return [];
  }

  const indexByPath = new Map(orderedPaths.map((path, index) => [path, index]));

  const dateLikePaths = orderedPaths.filter((path) => {
    const stats = fieldStats[path];
    if (!stats) return false;
    return validateFieldType(stats, "timestamp") > 0;
  });

  const makePair = (startPath: string, endPath: string): CandidatePairMetrics | null => {
    if (startPath === endPath) return null;

    const startStats = fieldStats[startPath];
    const endStats = fieldStats[endPath];
    if (!startStats || !endStats) return null;

    const startIndex = indexByPath.get(startPath) ?? Number.MAX_SAFE_INTEGER;
    const endIndex = indexByPath.get(endPath) ?? Number.MAX_SAFE_INTEGER;

    return {
      startPath,
      endPath,
      startIndex,
      endIndex,
      startValidity: validateFieldType(startStats, "timestamp"),
      endValidity: validateFieldType(endStats, "timestamp"),
      rowsWithParseableValue: 0,
      comparableRows: 0,
      orderedRows: 0,
    };
  };

  if (explicitTimestampPath) {
    return dateLikePaths
      .filter((path) => path !== explicitTimestampPath && !reservedPaths.has(path))
      .map((path) => makePair(explicitTimestampPath, path))
      .filter((pair): pair is CandidatePairMetrics => pair !== null);
  }

  if (explicitEndTimestampPath) {
    return dateLikePaths
      .filter((path) => path !== explicitEndTimestampPath && !reservedPaths.has(path))
      .map((path) => makePair(path, explicitEndTimestampPath))
      .filter((pair): pair is CandidatePairMetrics => pair !== null);
  }

  const availablePaths = dateLikePaths.filter((path) => !reservedPaths.has(path));
  const pairs: CandidatePairMetrics[] = [];

  for (let i = 0; i < availablePaths.length; i++) {
    const startPath = availablePaths[i];
    if (!startPath) continue;

    for (let j = i + 1; j < availablePaths.length; j++) {
      const endPath = availablePaths[j];
      if (!endPath) continue;

      const pair = makePair(startPath, endPath);
      if (pair) pairs.push(pair);
    }
  }

  return pairs;
};

export const createPairedDateInference = (options: PairedDateInferenceOptions) => {
  const existingMappings = options.existingMappings ?? {};
  const anchoredPaths = [existingMappings.timestampPath, existingMappings.endTimestampPath].filter(
    (path): path is string => Boolean(path)
  );
  const orderedPaths = uniquePathsInOrder(options.headers, options.fieldStats, anchoredPaths);

  const reservedPaths = new Set([...(options.reservedPaths ?? [])].filter((path): path is string => Boolean(path)));
  for (const idField of options.idFields ?? []) {
    if (!idField) continue;
    const stats = options.fieldStats[idField];
    if (stats && validateFieldType(stats, "timestamp") > 0) {
      continue;
    }
    reservedPaths.add(idField);
  }
  for (const anchoredPath of anchoredPaths) {
    reservedPaths.delete(anchoredPath);
  }

  const candidatePairs = buildCandidatePairs(orderedPaths, options.fieldStats, existingMappings, reservedPaths);
  const minimumComparableRows = options.minimumComparableRows ?? DEFAULT_MIN_COMPARABLE_ROWS;
  const minimumOrderAgreement = options.minimumOrderAgreement ?? DEFAULT_MIN_ORDER_AGREEMENT;
  const highConfidenceThreshold = options.highConfidenceThreshold ?? DEFAULT_HIGH_CONFIDENCE_THRESHOLD;
  let totalRows = 0;

  return {
    hasCandidates: candidatePairs.length > 0,

    processRows: (rows: Record<string, unknown>[]): void => {
      totalRows += rows.length;

      for (const row of rows) {
        for (const pair of candidatePairs) {
          const startValue = getByPathOrKey(row, pair.startPath);
          const endValue = getByPathOrKey(row, pair.endPath);

          if (isDateParseable(startValue) || isDateParseable(endValue)) {
            pair.rowsWithParseableValue++;
          }

          const startDate = parseDateInput(startValue as ParseableDateInput);
          const endDate = parseDateInput(endValue as ParseableDateInput);

          if (!startDate || !endDate) continue;

          pair.comparableRows++;
          if (startDate.getTime() <= endDate.getTime()) {
            pair.orderedRows++;
          }
        }
      }
    },

    getResult: (): PairedDateInferenceResult | null => {
      const eligiblePairs = candidatePairs
        .map((pair) => {
          const agreement = pair.comparableRows > 0 ? pair.orderedRows / pair.comparableRows : 0;
          if (pair.comparableRows < minimumComparableRows || agreement < minimumOrderAgreement) {
            return null;
          }

          const completeness = pair.rowsWithParseableValue > 0 ? pair.comparableRows / pair.rowsWithParseableValue : 0;
          const coverage = totalRows > 0 ? pair.comparableRows / totalRows : 0;
          const validity = (pair.startValidity + pair.endValidity) / 2;
          // Agreement (order-consistency) dominates because it is the single strongest signal
          // that two columns are a paired start/end. Completeness (how many rows with parseable
          // values are actually comparable), coverage (how much of the dataset the pair appears
          // in), and validity (how strongly both columns type-check as timestamps) are secondary
          // checks. These weights are rough and not empirically tuned; revisit if false
          // positives/negatives appear in the wild.
          const score = Math.min(1, agreement * 0.55 + completeness * 0.15 + coverage * 0.15 + validity * 0.15);

          return { ...pair, agreement, score, headerOrderStable: pair.startIndex < pair.endIndex ? 1 : 0 };
        })
        .filter(
          (pair): pair is CandidatePairMetrics & { agreement: number; score: number; headerOrderStable: number } =>
            pair !== null
        )
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          if (right.comparableRows !== left.comparableRows) return right.comparableRows - left.comparableRows;
          if (right.headerOrderStable !== left.headerOrderStable)
            return right.headerOrderStable - left.headerOrderStable;
          return left.startIndex - right.startIndex;
        });

      const bestPair = eligiblePairs[0];
      if (!bestPair) return null;

      return {
        timestampPath: bestPair.startPath,
        endTimestampPath: bestPair.endPath,
        confidence: bestPair.score,
        confidenceLevel: bestPair.score >= highConfidenceThreshold ? "high" : "medium",
        comparableRows: bestPair.comparableRows,
        agreement: bestPair.agreement,
      };
    },
  };
};
