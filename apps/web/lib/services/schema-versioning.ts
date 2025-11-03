/**
 * Provides a centralized service for managing dataset schema versions.
 *
 * This service contains a set of static methods to handle the lifecycle of dataset schemas.
 * It ensures that schema versions are created and numbered consistently, whether through an
 * automated process or manual approval. This consolidation prevents duplicate logic and
 * race conditions.
 *
 * Key responsibilities:
 * - Determining the next available version number for a dataset's schema.
 * - Creating a new, versioned schema document in the database.
 * - Linking an import job to the specific schema version it was validated against.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This service uses nested Payload operations and must receive the `req` parameter.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @module
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { logger } from "@/lib/logger";
import type { Dataset, DatasetSchema } from "@/payload-types";

/**
 * Consolidated schema versioning service to prevent duplicate creation
 * and ensure consistent version numbering across auto and manual approval flows.
 */
export class SchemaVersioningService {
  /**
   * Get the next schema version number for a dataset.
   */
  static async getNextSchemaVersion(
    payload: Payload,
    datasetId: string | number,
    req?: PayloadRequest
  ): Promise<number> {
    const existingSchemas = await payload.find({
      collection: COLLECTION_NAMES.DATASET_SCHEMAS,
      where: {
        dataset: { equals: typeof datasetId === "string" ? parseInt(datasetId, 10) : datasetId },
      },
      sort: "-versionNumber",
      limit: 1,
      req,
      overrideAccess: true,
    });

    const lastVersion = existingSchemas.docs[0]?.versionNumber ?? 0;
    return lastVersion + 1;
  }

  /**
   * Create a new schema version with consistent data structure.
   */
  static async createSchemaVersion(
    payload: Payload,
    {
      dataset,
      schema,
      fieldMetadata = {},
      autoApproved = false,
      approvedBy,
      importSources = [],
      req,
    }: {
      dataset: Dataset | string | number;
      schema: unknown;
      fieldMetadata?: Record<string, unknown>;
      autoApproved?: boolean;
      approvedBy?: string | number | null;
      importSources?: Array<{
        import: string | number;
        recordCount?: number;
        batchCount?: number;
      }>;
      req?: PayloadRequest;
    }
  ): Promise<DatasetSchema> {
    const datasetId = typeof dataset === "object" ? dataset.id : dataset;

    logger.info("Getting next schema version", { datasetId });
    const nextVersion = await this.getNextSchemaVersion(payload, datasetId, req);

    try {
      logger.info("Preparing to create dataset-schema record", {
        datasetId,
        nextVersion,
        hasSchema: !!schema,
        hasFieldMetadata: !!fieldMetadata,
        importSourcesCount: importSources.length,
      });

      const createData = {
        dataset: typeof datasetId === "string" ? parseInt(datasetId, 10) : datasetId,
        versionNumber: nextVersion,
        schema: schema as string | number | boolean | unknown[] | { [k: string]: unknown } | null,
        fieldMetadata,
        autoApproved,
        approvedBy: typeof approvedBy === "string" ? parseInt(approvedBy, 10) : approvedBy,
        importSources: importSources.map((source) => ({
          ...source,
          import: typeof source.import === "string" ? parseInt(source.import, 10) : source.import,
        })),
        _status: "published" as const,
      };

      logger.info("Calling payload.create for dataset-schemas", {
        datasetId: createData.dataset,
        versionNumber: createData.versionNumber,
      });

      const schemaVersion = await payload.create({
        collection: COLLECTION_NAMES.DATASET_SCHEMAS,
        data: createData,
        req,
        overrideAccess: true,
      });

      logger.info("Schema version created successfully", {
        schemaVersionId: schemaVersion.id,
        datasetId,
        versionNumber: nextVersion,
      });

      return schemaVersion;
    } catch (error) {
      logger.error("Failed to create schema version", {
        error,
        datasetId,
        nextVersion,
        hasSchema: !!schema,
        schemaType: typeof schema,
      });
      throw error;
    }
  }

  /**
   * Link an import job to a schema version.
   */
  static async linkImportToSchemaVersion(
    payload: Payload,
    importJobId: string | number,
    schemaVersionId: string | number,
    req?: PayloadRequest
  ): Promise<void> {
    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof importJobId === "string" ? parseInt(importJobId, 10) : importJobId,
      data: {
        datasetSchemaVersion: typeof schemaVersionId === "string" ? parseInt(schemaVersionId, 10) : schemaVersionId,
      },
      req,
      overrideAccess: true,
    });
  }
}
