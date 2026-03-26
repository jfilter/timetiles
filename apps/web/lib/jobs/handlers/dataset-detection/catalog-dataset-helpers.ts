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
import { logger } from "@/lib/logger";
import { parseStrictInteger } from "@/lib/utils/event-params";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Dataset } from "@/payload-types";

/** Build an immutable config snapshot from a dataset for the import job record. */
export const buildConfigSnapshot = (dataset: Dataset) => ({
  fieldMappingOverrides: dataset.fieldMappingOverrides ?? null,
  idStrategy: dataset.idStrategy ?? null,
  deduplicationConfig: dataset.deduplicationConfig ?? null,
  geoFieldDetection: dataset.geoFieldDetection ?? null,
  schemaConfig: dataset.schemaConfig ?? null,
  ingestTransforms: dataset.ingestTransforms ?? [],
});

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

  const catalog = await payload.findByID({ collection: "catalogs", id: catalogId, overrideAccess: true });

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

  // Create new dataset if not found
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
      _status: "published" as const,
      ...(userId ? { createdBy: userId } : {}),
    },
  });

  logger.info("Created new dataset", { datasetId: newDataset.id, name: datasetName, catalogId });

  return newDataset;
};
