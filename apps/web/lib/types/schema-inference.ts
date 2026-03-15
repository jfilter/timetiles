/**
 * Shared types for the schema inference API and its consumers.
 *
 * These types describe the request options and response returned by the
 * `/api/v1/datasets/[id]/schema/infer` endpoint. They live here (rather
 * than in the route file) so that both server and client code can import
 * them without creating a dependency from hooks/components into route modules.
 *
 * @module
 * @category Types
 */

/**
 * Options for controlling schema inference behavior.
 */
export interface SchemaInferenceOptions {
  /** Maximum number of events to sample (default: 500) */
  sampleSize?: number;
  /** Number of events to process per batch (default: 100) */
  batchSize?: number;
  /** Generate schema even if one already exists and is fresh (default: false) */
  forceRegenerate?: boolean;
}

/**
 * Response format for the schema inference endpoint.
 */
export interface SchemaInferenceResponse {
  generated: boolean;
  message: string;
  eventsSampled?: number;
  schema: { id: number; versionNumber: number; createdAt: string; eventCountAtCreation?: number } | null;
}
