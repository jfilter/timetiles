/**
 * Zod schemas for the dataset schema inference API.
 *
 * @module
 * @category Schemas
 */
import { z } from "./common";

/** Request body for POST /api/v1/datasets/{id}/schema/infer */
export const SchemaInferenceBodySchema = z
  .object({
    sampleSize: z.number().int().positive().optional(),
    batchSize: z.number().int().positive().optional(),
    forceRegenerate: z.boolean().optional(),
  })
  .openapi("SchemaInferenceRequest");

/** Response for POST /api/v1/datasets/{id}/schema/infer */
export const SchemaInferenceResponseSchema = z
  .object({
    generated: z.boolean(),
    message: z.string(),
    eventsSampled: z.number().optional(),
    schema: z
      .object({
        id: z.number(),
        versionNumber: z.number(),
        createdAt: z.string(),
        eventCountAtCreation: z.number().optional(),
      })
      .nullable(),
  })
  .openapi("SchemaInferenceResponse");
