/**
 * Zod schemas for the data sources API.
 *
 * @module
 * @category Schemas
 */
import { z } from "./common";

/** Query parameters for GET /api/v1/data-sources */
export const DataSourcesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(250),
  })
  .openapi("DataSourcesQuery");

export const DataSourceCatalogSchema = z
  .object({ id: z.number(), name: z.string(), isOwned: z.boolean(), description: z.string().optional() })
  .openapi("DataSourceCatalog");

export const DataSourceDatasetSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    catalogId: z.number().nullable(),
    hasTemporalData: z.boolean(),
    description: z.string().optional(),
    language: z.string().optional(),
  })
  .openapi("DataSourceDataset");

/** Response for GET /api/v1/data-sources */
export const DataSourcesResponseSchema = z
  .object({
    catalogs: z.array(DataSourceCatalogSchema),
    datasets: z.array(DataSourceDatasetSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      totalDocs: z.number(),
      totalPages: z.number(),
      hasNextPage: z.boolean(),
      hasPrevPage: z.boolean(),
      nextPage: z.number().nullable().optional(),
      prevPage: z.number().nullable().optional(),
    }),
  })
  .openapi("DataSourcesResponse");
