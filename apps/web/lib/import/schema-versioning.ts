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
import { optionalStrictInteger, requireStrictInteger } from "@/lib/utils/event-params";
import { requireRelationId } from "@/lib/utils/relation-id";
import type { Dataset, DatasetSchema } from "@/payload-types";

/**
 * Consolidated schema versioning service to prevent duplicate creation
 * and ensure consistent version numbering across auto and manual approval flows.
 */
export class SchemaVersioningService {
  private static normalizeRequiredId(value: string | number, label: string): number {
    return requireStrictInteger(value, label);
  }

  private static normalizeOptionalId(
    value: string | number | null | undefined,
    label: string
  ): number | null | undefined {
    return optionalStrictInteger(value, label);
  }

  /**
   * Get the next schema version number for a dataset.
   */
  static async getNextSchemaVersion(
    payload: Payload,
    datasetId: string | number,
    req?: PayloadRequest
  ): Promise<number> {
    const normalizedDatasetId = this.normalizeRequiredId(datasetId, "dataset");

    const existingSchemas = await payload.find({
      collection: COLLECTION_NAMES.DATASET_SCHEMAS,
      where: { dataset: { equals: normalizedDatasetId } },
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
      fieldMappings,
      autoApproved = false,
      approvedBy,
      importSources = [],
      eventCountAtCreation,
      req,
    }: {
      dataset: Dataset | string | number;
      schema: unknown;
      fieldMetadata?: Record<string, unknown>;
      fieldMappings?: { titlePath?: string | null; descriptionPath?: string | null; timestampPath?: string | null };
      autoApproved?: boolean;
      approvedBy?: string | number | null;
      importSources?: Array<{ import: string | number; recordCount?: number; batchCount?: number }>;
      /** Number of events in the dataset when this schema was generated */
      eventCountAtCreation?: number;
      req?: PayloadRequest;
    }
  ): Promise<DatasetSchema> {
    const datasetId = requireRelationId(dataset, "schema.dataset");
    const normalizedDatasetId = this.normalizeRequiredId(datasetId, "dataset");

    logger.info("Getting next schema version", { datasetId });
    const nextVersion = await this.getNextSchemaVersion(payload, normalizedDatasetId, req);

    try {
      logger.info("Preparing to create dataset-schema record", {
        datasetId,
        nextVersion,
        hasSchema: !!schema,
        hasFieldMetadata: !!fieldMetadata,
        hasFieldMappings: !!fieldMappings,
        importSourcesCount: importSources.length,
      });

      const createData = {
        dataset: normalizedDatasetId,
        versionNumber: nextVersion,
        schema: schema as string | number | boolean | unknown[] | { [k: string]: unknown } | null,
        fieldMetadata,
        fieldMappings,
        autoApproved,
        approvedBy: this.normalizeOptionalId(approvedBy, "approvedBy"),
        importSources: importSources.map((source) => ({
          ...source,
          import: this.normalizeRequiredId(source.import, "import source"),
        })),
        eventCountAtCreation,
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
    const normalizedImportJobId = this.normalizeRequiredId(importJobId, "import job");
    const normalizedSchemaVersionId = this.normalizeRequiredId(schemaVersionId, "schema version");

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: normalizedImportJobId,
      data: { datasetSchemaVersion: normalizedSchemaVersionId },
      req,
      overrideAccess: true,
    });
  }
}
