/**
 * Catalog and dataset resolution helpers for dataset detection.
 *
 * Handles finding or creating catalogs and datasets, validating user access,
 * and building config snapshots for import job records.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { isUniqueViolation } from "@/lib/database/unique-violation";
import { logger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";
import { parseStrictInteger } from "@/lib/utils/event-params";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Dataset } from "@/payload-types";

/** Build an immutable config snapshot from a dataset for the import job record. */
export const buildConfigSnapshot = (dataset: Dataset) => ({
  // The AUTHORED interpretation plan, frozen at job-creation time. The detector
  // resolves it into the job plan; freezing it keeps the deterministic-run guarantee.
  interpretationPlan: dataset.interpretationPlan ?? null,
  idStrategy: dataset.idStrategy ?? null,
  deduplicationConfig: dataset.deduplicationConfig ?? null,
  geoFieldDetection: dataset.geoFieldDetection ?? null,
  schemaConfig: dataset.schemaConfig ?? null,
});

/**
 * Canonical shape of `ingest-jobs.configSnapshot`, derived from the producer
 * so the type stays in sync with Payload's Dataset schema without a parallel
 * Zod definition that could drift.
 *
 * Payload persists `configSnapshot` as JSON, so readers see it as `unknown`
 * in generated types — use {@link readConfigSnapshot} at the read site.
 */
export type ConfigSnapshot = ReturnType<typeof buildConfigSnapshot>;

/**
 * Validates that a user has access to the dataset's catalog.
 * Throws if the user does not own the catalog and it is not public.
 */
export const validateDatasetAccessForUser = async (
  payload: Payload,
  dataset: Dataset,
  userId: number | undefined
): Promise<void> => {
  if (!userId) return;

  const catalogId = extractRelationId(dataset.catalog);
  if (!catalogId) return;

  const catalog = await asSystem(payload).findByID({ collection: "catalogs", id: catalogId });

  const catalogOwnerId = extractRelationId(catalog?.createdBy);
  const isPublicCatalog = catalog?.isPublic ?? false;

  if (catalogOwnerId !== userId && !isPublicCatalog) {
    throw new Error(
      `Ingest file owner does not have access to the target dataset (dataset ${dataset.id} in catalog ${catalogId})`
    );
  }
};

/** Get or create a catalog, returning its numeric ID. */
export const getOrCreateCatalog = async (
  payload: Payload,
  catalogId?: string | number,
  userId?: number
): Promise<number> => {
  if (typeof catalogId === "number") {
    return catalogId;
  }

  if (catalogId) {
    const parsedCatalogId = parseStrictInteger(catalogId);
    if (parsedCatalogId == null) {
      throw new Error("Invalid catalog ID");
    }

    return parsedCatalogId;
  }

  // Create new catalog for this import
  const newCatalog = await payload.create({
    collection: COLLECTION_NAMES.CATALOGS,
    data: {
      name: `Import Catalog ${new Date().toISOString().split("T")[0]}`,
      description: {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [{ type: "text", version: 1, text: "Auto-generated catalog for imported data" }],
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      },
      _status: "published",
      ...(userId ? { createdBy: userId } : {}),
    },
  });

  if (typeof newCatalog.id === "number") {
    return newCatalog.id;
  }

  const parsedCatalogId = parseStrictInteger(String(newCatalog.id));
  if (parsedCatalogId == null) {
    throw new Error("Invalid catalog ID");
  }

  return parsedCatalogId;
};

/** Find an existing dataset in a catalog by name, or create a new one. */
export const findOrCreateDataset = async (
  payload: Payload,
  catalogId: number,
  datasetName: string,
  userId?: number
): Promise<Dataset> => {
  // Try to find existing dataset in catalog
  const existingDatasets = await payload.find({
    collection: COLLECTION_NAMES.DATASETS,
    where: { catalog: { equals: catalogId }, name: { equals: datasetName } },
    limit: 1,
  });

  if (existingDatasets.docs.length > 0 && existingDatasets.docs[0]) {
    logger.info("Found existing dataset", { datasetId: existingDatasets.docs[0].id, name: datasetName });
    return existingDatasets.docs[0];
  }

  // Create new dataset if not found. Two imports that both miss the find above
  // can race here (manual-ingest serializes per ingest-file, so two different
  // files are not ordered); the datasets_catalog_name_unique index makes the
  // loser throw PG 23505. Catch it and re-read the dataset the winner just
  // committed instead of failing the import — mirrors the register-route and
  // schema-versioning recoveries.
  try {
    const newDataset = await payload.create({
      collection: COLLECTION_NAMES.DATASETS,
      data: {
        name: datasetName,
        catalog: catalogId,
        description: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [{ type: "text", version: 1, text: `Auto-created dataset for ${datasetName}` }],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
        language: "eng",
        // Use default configurations
        deduplicationConfig: { enabled: true },
        schemaConfig: { autoGrow: true, autoApproveNonBreaking: true, locked: false },
        idStrategy: { type: "content-hash", duplicateStrategy: "skip" },
        // Empty authored plan. "strict" is the default (ADR 0040): an ambiguous
        // order pauses for review rather than guessing per row. Unattended sources
        // (scraper/url-fetch/data-package) suppress that gate via their own
        // skipAmbiguous* review-check flags, so strict here does not stall them.
        interpretationPlan: { ops: [], columns: [], roles: {}, ambiguityResolution: "strict" },
        _status: "published" as const,
        ...(userId ? { createdBy: userId } : {}),
      },
    });
    logger.info("Created new dataset", { datasetId: newDataset.id, name: datasetName, catalogId });
    return newDataset;
  } catch (error) {
    if (!isUniqueViolation(error, "datasets_catalog_name_unique")) throw error;
    const raced = await payload.find({
      collection: COLLECTION_NAMES.DATASETS,
      where: { catalog: { equals: catalogId }, name: { equals: datasetName } },
      limit: 1,
    });
    if (raced.docs[0]) {
      logger.info("Reused dataset created by a concurrent import", {
        datasetId: raced.docs[0].id,
        name: datasetName,
        catalogId,
      });
      return raced.docs[0];
    }
    throw error;
  }
};
