/**
 * Provides on-demand schema inference for datasets.
 *
 * This service analyzes existing events in a dataset and generates a schema
 * by sampling events in batches. It's designed for datasets that weren't
 * created through the import pipeline (e.g., seeding, direct API creation).
 *
 * The service reuses the existing ProgressiveSchemaBuilder for schema detection
 * and SchemaVersioningService for creating schema versions.
 *
 * @module
 * @category Services
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { logger } from "@/lib/logger";
import type { Dataset, DatasetSchema } from "@/payload-types";

import { ProgressiveSchemaBuilder } from "./schema-builder";
import { getSchemaFreshness } from "./schema-freshness";
import { SchemaVersioningService } from "./schema-versioning";

/** Default number of events to sample for schema inference */
const DEFAULT_SAMPLE_SIZE = 500;

/** Default batch size for processing events */
const DEFAULT_BATCH_SIZE = 100;

export interface SchemaInferenceOptions {
  /** Maximum number of events to sample (default: 500) */
  sampleSize?: number;
  /** Number of events to process per batch (default: 100) */
  batchSize?: number;
  /** Generate schema even if one already exists and is fresh (default: false) */
  forceRegenerate?: boolean;
  /** Payload request for context passing */
  req?: PayloadRequest;
}

export interface SchemaInferenceResult {
  /** Whether a schema was generated */
  generated: boolean;
  /** The generated or existing schema, if any */
  schema: DatasetSchema | null;
  /** Message describing the result */
  message: string;
  /** Number of events sampled */
  eventsSampled?: number;
}

interface InferenceContext {
  payload: Payload;
  datasetId: number;
  dataset: Dataset;
  latestSchema: DatasetSchema | null;
  options: Required<Pick<SchemaInferenceOptions, "sampleSize" | "batchSize">> & Pick<SchemaInferenceOptions, "req">;
}

/**
 * Service for inferring schemas from existing event data.
 */
export class SchemaInferenceService {
  /**
   * Generate a schema from existing events in a dataset.
   */
  static async inferSchemaFromEvents(
    payload: Payload,
    datasetId: number,
    options: SchemaInferenceOptions = {}
  ): Promise<SchemaInferenceResult> {
    const { sampleSize = DEFAULT_SAMPLE_SIZE, batchSize = DEFAULT_BATCH_SIZE, forceRegenerate = false, req } = options;

    logger.info("Starting schema inference", { datasetId, sampleSize, batchSize, forceRegenerate });

    // Fetch and validate dataset
    const dataset = await this.fetchDataset(payload, datasetId, req);
    if (!dataset) {
      return { generated: false, schema: null, message: `Dataset ${datasetId} not found` };
    }

    // Get latest schema
    const latestSchema = await this.getLatestSchema(payload, datasetId, req);

    // Check freshness (queries event count from DB)
    const freshnessResult = await this.checkFreshness(payload, datasetId, latestSchema, forceRegenerate, req);
    if (freshnessResult.skipGeneration) {
      return freshnessResult.result;
    }

    const eventCount = freshnessResult.eventCount;
    if (eventCount === 0) {
      logger.info("No events in dataset, cannot generate schema", { datasetId });
      return { generated: false, schema: latestSchema, message: "No events in dataset to analyze", eventsSampled: 0 };
    }

    // Build context and generate schema
    const context: InferenceContext = {
      payload,
      datasetId,
      dataset,
      latestSchema,
      options: { sampleSize, batchSize, req },
    };

    return this.generateSchema(context, eventCount);
  }

  /**
   * Get the latest schema for a dataset, or null if none exists.
   */
  static async getLatestSchema(
    payload: Payload,
    datasetId: number,
    req?: PayloadRequest
  ): Promise<DatasetSchema | null> {
    const schemas = await payload.find({
      collection: COLLECTION_NAMES.DATASET_SCHEMAS,
      where: { dataset: { equals: datasetId } },
      sort: "-versionNumber",
      limit: 1,
      overrideAccess: true,
      req,
    });

    return (schemas.docs[0] as DatasetSchema) ?? null;
  }

  /** Fetch dataset by ID */
  private static async fetchDataset(
    payload: Payload,
    datasetId: number,
    req?: PayloadRequest
  ): Promise<Dataset | null> {
    try {
      return await payload.findByID({
        collection: COLLECTION_NAMES.DATASETS,
        id: datasetId,
        overrideAccess: true,
        req,
      });
    } catch {
      return null;
    }
  }

  /** Check if schema regeneration is needed and get current event count */
  private static async checkFreshness(
    payload: Payload,
    datasetId: number,
    latestSchema: DatasetSchema | null,
    forceRegenerate: boolean,
    req?: PayloadRequest
  ): Promise<{ skipGeneration: boolean; result: SchemaInferenceResult; eventCount: number }> {
    // Query actual event count from database
    const freshness = await getSchemaFreshness(payload, datasetId, latestSchema, req);
    const eventCount = freshness.currentEventCount;

    if (forceRegenerate || !latestSchema) {
      return {
        skipGeneration: false,
        result: { generated: false, schema: latestSchema, message: "" },
        eventCount,
      };
    }

    if (!freshness.stale) {
      logger.info("Schema is fresh, skipping regeneration", { datasetId });
      return {
        skipGeneration: true,
        result: { generated: false, schema: latestSchema, message: "Schema is up-to-date" },
        eventCount,
      };
    }

    logger.info("Schema is stale, regenerating", {
      datasetId,
      reason: freshness.reason,
      currentEventCount: freshness.currentEventCount,
      schemaEventCount: freshness.schemaEventCount,
    });

    return {
      skipGeneration: false,
      result: { generated: false, schema: latestSchema, message: "" },
      eventCount,
    };
  }

  /** Generate schema by sampling events */
  private static async generateSchema(context: InferenceContext, eventCount: number): Promise<SchemaInferenceResult> {
    const { payload, datasetId, dataset, options } = context;
    const { sampleSize, batchSize, req } = options;

    // Create schema builder with dataset config
    const schemaBuilder = this.createSchemaBuilder(dataset, sampleSize);

    // Process events in batches
    const processedCount = await this.processEventBatches(
      payload,
      datasetId,
      schemaBuilder,
      sampleSize,
      batchSize,
      eventCount,
      req
    );

    logger.info("Event sampling complete", { datasetId, processedCount });

    // Create schema version
    const schema = await schemaBuilder.getSchema();
    const fieldStats = schemaBuilder.getFieldStatistics();

    const schemaVersion = await SchemaVersioningService.createSchemaVersion(payload, {
      dataset: datasetId,
      schema,
      fieldMetadata: fieldStats,
      autoApproved: true,
      eventCountAtCreation: eventCount,
      req,
    });

    logger.info("Schema version created", {
      datasetId,
      schemaVersionId: schemaVersion.id,
      versionNumber: schemaVersion.versionNumber,
      eventsSampled: processedCount,
    });

    return {
      generated: true,
      schema: schemaVersion,
      message: `Schema generated from ${processedCount} events`,
      eventsSampled: processedCount,
    };
  }

  /** Create configured schema builder */
  private static createSchemaBuilder(dataset: Dataset, sampleSize: number): ProgressiveSchemaBuilder {
    const schemaConfig = dataset.schemaConfig ?? {};
    return new ProgressiveSchemaBuilder(undefined, {
      maxSamples: sampleSize,
      maxDepth: schemaConfig.maxSchemaDepth ?? 3,
      enumThreshold: schemaConfig.enumThreshold ?? 50,
      enumMode: (schemaConfig.enumMode as "count" | "percentage") ?? "count",
    });
  }

  /** Process events in batches and return count processed */
  private static async processEventBatches(
    payload: Payload,
    datasetId: number,
    schemaBuilder: ProgressiveSchemaBuilder,
    sampleSize: number,
    batchSize: number,
    eventCount: number,
    req?: PayloadRequest
  ): Promise<number> {
    let processedCount = 0;
    let page = 1;
    const eventsToSample = Math.min(sampleSize, eventCount);

    while (processedCount < eventsToSample) {
      const remainingToSample = eventsToSample - processedCount;
      const currentBatchSize = Math.min(batchSize, remainingToSample);

      const events = await payload.find({
        collection: COLLECTION_NAMES.EVENTS,
        where: { dataset: { equals: datasetId } },
        limit: currentBatchSize,
        page,
        overrideAccess: true,
        req,
      });

      if (events.docs.length === 0) {
        break;
      }

      const dataRecords = events.docs
        .map((event) => event.data)
        .filter((data): data is Record<string, unknown> => data != null && typeof data === "object");

      if (dataRecords.length > 0) {
        schemaBuilder.processBatch(dataRecords);
      }

      processedCount += events.docs.length;
      page++;

      if (!events.hasNextPage) {
        break;
      }
    }

    return processedCount;
  }
}
