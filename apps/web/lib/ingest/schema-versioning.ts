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
 * ⚠️ Concurrency model
 * When two workflow tasks process sheets that share a dataset, both can read the same
 * MAX(versionNumber) and attempt to insert `N+1`. Three defenses:
 * 1. `pg_advisory_xact_lock` keyed per-dataset, held across the read→write
 *    (inside the caller's Payload transaction via `req.transactionID`).
 * 2. Unique index on `(dataset_id, version_number)` (migration `20260416_092834_*`).
 * 3. Bounded retry on unique-violation — covers the lock-bypass case.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This service uses nested Payload operations and must receive the `req` parameter.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { logger } from "@/lib/logger";
import { optionalStrictInteger, requireStrictInteger } from "@/lib/utils/event-params";
import { requireRelationId } from "@/lib/utils/relation-id";
import type { Dataset, DatasetSchema } from "@/payload-types";

const MAX_CREATE_ATTEMPTS = 5;

/**
 * Detects unique-constraint violations across three wrapping layers:
 * 1. Raw pg error — `code === '23505'`.
 * 2. Payload ValidationError — wraps the pg error; the `errors` entries carry
 *    `message: 'Value must be unique'` and `path` = the constraint's columns.
 * 3. Fallback string matching — covers any intermediate wrapping that
 *    preserves the constraint name or pg error code in the message.
 */
const isUniqueViolation = (error: unknown): boolean => {
  if (!error) return false;
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") return true;

  const errors = (error as { data?: { errors?: Array<{ message?: string; path?: string }> } } | null)?.data?.errors;
  if (
    errors?.some(
      (e) =>
        /must be unique/i.test(e.message ?? "") &&
        (e.path ?? "").includes("dataset") &&
        (e.path ?? "").includes("version")
    )
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return (
    message.includes("23505") ||
    message.includes("dataset_schemas_dataset_version_unique") ||
    (message.includes("duplicate key") && message.includes("dataset_schemas"))
  );
};

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
   * Acquire a per-dataset transaction-scoped advisory lock. Released when the
   * caller's Payload transaction commits or rolls back. No-op if `req` doesn't
   * carry a transaction — callers without a transaction rely on the unique
   * index + retry for correctness.
   *
   * The first lock key is a stable hash of a namespace string, the second is
   * the dataset id — standard Postgres pattern for scoped advisory locks.
   */
  private static async acquireDatasetLock(payload: Payload, datasetId: number, req?: PayloadRequest): Promise<void> {
    if (!req?.transactionID) return;
    const drizzle = await getTransactionAwareDrizzle(payload, req);
    await drizzle.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtext('timetiles.dataset_schema_version')::int,
        ${datasetId}::int
      )
    `);
  }

  /**
   * Get the next schema version number for a dataset.
   *
   * Must run under an advisory lock (see `acquireDatasetLock`) when used to
   * derive a value for an INSERT; the read-then-write pattern otherwise races
   * under concurrent callers.
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
      ingestSources = [],
      eventCountAtCreation,
      req,
    }: {
      dataset: Dataset | string | number;
      schema: unknown;
      fieldMetadata?: Record<string, unknown>;
      fieldMappings?: { titlePath?: string | null; descriptionPath?: string | null; timestampPath?: string | null };
      autoApproved?: boolean;
      approvedBy?: string | number | null;
      ingestSources?: Array<{ ingestJob: string | number; recordCount?: number; batchCount?: number }>;
      /** Number of events in the dataset when this schema was generated */
      eventCountAtCreation?: number;
      req?: PayloadRequest;
    }
  ): Promise<DatasetSchema> {
    const datasetId = requireRelationId(dataset, "schema.dataset");
    const normalizedDatasetId = this.normalizeRequiredId(datasetId, "dataset");

    await this.acquireDatasetLock(payload, normalizedDatasetId, req);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
      logger.info("Getting next schema version", { datasetId, attempt });
      const nextVersion = await this.getNextSchemaVersion(payload, normalizedDatasetId, req);

      const createData = {
        dataset: normalizedDatasetId,
        versionNumber: nextVersion,
        schema: schema as string | number | boolean | unknown[] | { [k: string]: unknown } | null,
        fieldMetadata,
        fieldMappings,
        autoApproved,
        approvedBy: this.normalizeOptionalId(approvedBy, "approvedBy"),
        ingestSources: ingestSources.map((source) => ({
          ...source,
          ingestJob: this.normalizeRequiredId(source.ingestJob, "ingest source"),
        })),
        eventCountAtCreation,
        _status: "published" as const,
      };

      logger.info("Calling payload.create for dataset-schemas", {
        datasetId: createData.dataset,
        versionNumber: createData.versionNumber,
        attempt,
      });

      try {
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
        lastError = error;
        if (isUniqueViolation(error) && attempt < MAX_CREATE_ATTEMPTS) {
          logger.warn("Schema version unique-violation, retrying", {
            datasetId,
            attemptedVersion: nextVersion,
            attempt,
          });
          continue;
        }
        logger.error("Failed to create schema version", {
          error,
          datasetId,
          nextVersion,
          hasSchema: !!schema,
          schemaType: typeof schema,
          attempt,
        });
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to create schema version after retries");
  }

  /**
   * Link an import job to a schema version.
   */
  static async linkImportToSchemaVersion(
    payload: Payload,
    ingestJobId: string | number,
    schemaVersionId: string | number,
    req?: PayloadRequest
  ): Promise<void> {
    const normalizedIngestJobId = this.normalizeRequiredId(ingestJobId, "import job");
    const normalizedSchemaVersionId = this.normalizeRequiredId(schemaVersionId, "schema version");

    await payload.update({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      id: normalizedIngestJobId,
      data: { datasetSchemaVersion: normalizedSchemaVersionId },
      req,
      overrideAccess: true,
    });
  }
}
