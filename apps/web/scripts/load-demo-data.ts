#!/usr/bin/env node
/**
 * Loads public demo datasets from Berlin Open Data (daten.berlin.de).
 *
 * Creates a catalog, datasets, and scheduled ingests pointing to Berlin's
 * WFS/GeoJSON endpoints. All datasets include coordinates so no geocoding
 * is needed.
 *
 * Usage:
 *   pnpm demo-data               # Create catalog + scheduled ingests (disabled)
 *   pnpm demo-data --trigger     # Also trigger immediate import for all
 *   pnpm demo-data --clean       # Remove previously created demo data
 *
 * @module
 * @category Scripts
 */

import { getPayload } from "payload";

import { createSystemUserService } from "@/lib/account/system-user";
import { buildConfigWithDefaults } from "@/lib/config/payload-config-factory";
import { createLogger, logError } from "@/lib/logger";

const logger = createLogger("demo-data");

// ---------------------------------------------------------------------------
// Demo data source definitions
// ---------------------------------------------------------------------------

interface DemoSource {
  /** Display name for the dataset */
  name: string;
  /** Short description */
  description: string;
  /** WFS GeoJSON URL (all include srsName=EPSG:4326 for lat/lon) */
  sourceUrl: string;
}

const CATALOG_NAME = "Berlin Open Data";
const CATALOG_SLUG = "berlin-open-data";

/**
 * All sources use Berlin's GDI WFS endpoints returning GeoJSON.
 * The import pipeline auto-converts GeoJSON to CSV with latitude/longitude columns.
 */
const DEMO_SOURCES: DemoSource[] = [
  {
    name: "Berliner Schulen",
    description: "Standorte der Berliner Schulen mit Schulart, Adresse und Kontakt",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/schulen?service=WFS&version=2.0.0&request=GetFeature&typeNames=schulen:schulen&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Kindertagesstätten",
    description: "Standorte der öffentlich geförderten Berliner Kindertagesstätten",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/kita?service=WFS&version=2.0.0&request=GetFeature&typeNames=kita:kita&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Apotheken",
    description: "Standorte der öffentlichen Apotheken in Berlin",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/apotheken?service=WFS&version=2.0.0&request=GetFeature&typeNames=apotheken:apotheken&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Krankenhäuser",
    description: "Standorte der Berliner Plankrankenhäuser",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/krankenhaeuser?service=WFS&version=2.0.0&request=GetFeature&typeNames=krankenhaeuser:plankrankenhaeuser&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Denkmale",
    description: "Daten aus der Berliner Denkmalliste mit Denkmalposition",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/denkmale?service=WFS&version=2.0.0&request=GetFeature&typeNames=denkmale:denkmale&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Spielplätze",
    description: "Öffentliche Spielplätze im Berliner Grünanlagenbestand",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/gruenanlagen?service=WFS&version=2.0.0&request=GetFeature&typeNames=gruenanlagen:spielplaetze&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Öffentliche Toiletten",
    description: "Standorte der öffentlichen Toiletten in Berlin",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/toiletten?service=WFS&version=2.0.0&request=GetFeature&typeNames=toiletten:toiletten&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Friedhöfe",
    description: "Alle geöffneten und geschlossenen Berliner Friedhöfe",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/friedhofsbestand?service=WFS&version=2.0.0&request=GetFeature&typeNames=friedhofsbestand:friedhofsbestand_berlin&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Sportanlagen",
    description: "Standorte öffentlicher Kernsportanlagen im Land Berlin",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/sportstandorte?service=WFS&version=2.0.0&request=GetFeature&typeNames=sportstandorte:sportstandorte&outputFormat=application/json&srsName=EPSG:4326",
  },
  {
    name: "Grünanlagen",
    description: "Öffentliche Grünanlagen und Parks in Berlin",
    sourceUrl:
      "https://gdi.berlin.de/services/wfs/gruenanlagen?service=WFS&version=2.0.0&request=GetFeature&typeNames=gruenanlagen:gruenanlagen&outputFormat=application/json&srsName=EPSG:4326",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>;

const getOrCreateSystemUser = async (payload: PayloadInstance) => {
  const service = createSystemUserService(payload);
  return service.getOrCreateSystemUser();
};

const findOrCreateCatalog = async (payload: PayloadInstance, userId: number) => {
  const { docs } = await payload.find({
    collection: "catalogs",
    where: { slug: { equals: CATALOG_SLUG } },
    limit: 1,
    overrideAccess: true,
  });

  if (docs.length > 0) {
    logger.info({ catalogId: docs[0]!.id }, "Using existing catalog: %s", CATALOG_NAME);
    return docs[0]!;
  }

  const catalog = await payload.create({
    collection: "catalogs",
    data: { name: CATALOG_NAME, slug: CATALOG_SLUG, isPublic: true, createdBy: userId },
    overrideAccess: true,
    context: { skipQuotaChecks: true },
  });

  logger.info({ catalogId: catalog.id }, "Created catalog: %s", CATALOG_NAME);
  return catalog;
};

const createDatasetForSource = async (
  payload: PayloadInstance,
  source: DemoSource,
  catalogId: number,
  userId: number
) => {
  const { docs } = await payload.find({
    collection: "datasets",
    where: { and: [{ name: { equals: source.name } }, { catalog: { equals: catalogId } }] },
    limit: 1,
    overrideAccess: true,
  });

  if (docs.length > 0) {
    logger.info({ datasetId: docs[0]!.id }, "Dataset already exists: %s", source.name);
    return docs[0]!;
  }

  return payload.create({
    collection: "datasets",
    data: {
      name: source.name,
      catalog: catalogId,
      language: "deu",
      isPublic: true,
      createdBy: userId,
      hasTemporalData: false,
      schemaConfig: { autoGrow: true, autoApproveNonBreaking: true },
      geoFieldDetection: { autoDetect: true },
    },
    overrideAccess: true,
  });
};

const createScheduledIngestForSource = async (
  payload: PayloadInstance,
  source: DemoSource,
  catalogId: number,
  datasetId: number,
  userId: number
) => {
  const { docs } = await payload.find({
    collection: "scheduled-ingests",
    where: { and: [{ name: { equals: source.name } }, { catalog: { equals: catalogId } }] },
    limit: 1,
    overrideAccess: true,
  });

  if (docs.length > 0) {
    logger.info({ scheduledIngestId: docs[0]!.id }, "Scheduled ingest already exists: %s", source.name);
    return docs[0]!;
  }

  return payload.create({
    collection: "scheduled-ingests",
    data: {
      name: source.name,
      description: source.description,
      sourceUrl: source.sourceUrl,
      catalog: catalogId,
      dataset: datasetId,
      createdBy: userId,
      enabled: false,
      scheduleType: "frequency",
      frequency: "weekly",
      timezone: "Europe/Berlin",
      schemaMode: "additive",
      authConfig: { type: "none" },
      advancedOptions: {
        reviewChecks: {
          // Berlin WFS datasets are POI data without timestamps
          skipTimestampCheck: true,
        },
      },
    },
    overrideAccess: true,
    context: { skipQuotaChecks: true },
  });
};

const triggerImport = async (payload: PayloadInstance, scheduledIngestId: number) => {
  // Enable the ingest first — url-fetch requires it to be enabled
  const si = await payload.update({
    collection: "scheduled-ingests",
    id: scheduledIngestId,
    data: { enabled: true },
    overrideAccess: true,
    context: { skipQuotaChecks: true },
  });

  await payload.jobs.queue({
    task: "url-fetch",
    input: {
      scheduledIngestId: si.id,
      sourceUrl: si.sourceUrl,
      authConfig: si.authConfig,
      originalName: si.name,
      triggeredBy: "demo-data-script",
    },
  });

  logger.info({ scheduledIngestId: si.id }, "Queued import: %s", si.name);
};

// ---------------------------------------------------------------------------
// Clean command
// ---------------------------------------------------------------------------

const cleanDemoData = async (payload: PayloadInstance) => {
  const { docs: catalogs } = await payload.find({
    collection: "catalogs",
    where: { slug: { equals: CATALOG_SLUG } },
    limit: 1,
    overrideAccess: true,
  });

  if (catalogs.length === 0) {
    logger.info("No demo catalog found, nothing to clean.");
    return;
  }

  const catalogId = catalogs[0]!.id;

  // Delete scheduled ingests
  const { docs: ingests } = await payload.find({
    collection: "scheduled-ingests",
    where: { catalog: { equals: catalogId } },
    pagination: false,
    overrideAccess: true,
  });

  for (const ingest of ingests) {
    await payload.delete({ collection: "scheduled-ingests", id: ingest.id, overrideAccess: true });
  }
  logger.info("Deleted %d scheduled ingests", ingests.length);

  // Delete datasets and their events
  const { docs: datasets } = await payload.find({
    collection: "datasets",
    where: { catalog: { equals: catalogId } },
    pagination: false,
    overrideAccess: true,
  });

  for (const dataset of datasets) {
    // Delete ingest jobs referencing this dataset
    await payload.delete({
      collection: "ingest-jobs",
      where: { dataset: { equals: dataset.id } },
      overrideAccess: true,
    });
    // Delete events
    await payload.delete({ collection: "events", where: { dataset: { equals: dataset.id } }, overrideAccess: true });
    await payload.delete({ collection: "datasets", id: dataset.id, overrideAccess: true });
  }
  logger.info("Deleted %d datasets and their events", datasets.length);

  // Delete ingest files for this catalog
  await payload.delete({ collection: "ingest-files", where: { catalog: { equals: catalogId } }, overrideAccess: true });

  // Delete catalog
  await payload.delete({ collection: "catalogs", id: catalogId, overrideAccess: true });
  logger.info("Deleted catalog: %s", CATALOG_NAME);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const args = process.argv.slice(2);
  const shouldTrigger = args.includes("--trigger");
  const shouldClean = args.includes("--clean");

  logger.info("Initializing Payload...");
  const payload = await getPayload({ config: await buildConfigWithDefaults() });

  try {
    if (shouldClean) {
      await cleanDemoData(payload);
      logger.info("Demo data cleaned.");
      return;
    }

    // Get or create system user (demo data is system-owned, not personal)
    const systemUser = await getOrCreateSystemUser(payload);
    logger.info({ userId: systemUser.id, email: systemUser.email }, "Using system user");

    // Create or find catalog
    const catalog = await findOrCreateCatalog(payload, systemUser.id);

    // Create datasets and scheduled ingests
    const created: Array<{ name: string; datasetId: number; ingestId: number }> = [];

    for (const source of DEMO_SOURCES) {
      const dataset = await createDatasetForSource(payload, source, catalog.id, systemUser.id);
      const ingest = await createScheduledIngestForSource(payload, source, catalog.id, dataset.id, systemUser.id);
      created.push({ name: source.name, datasetId: dataset.id, ingestId: ingest.id });
      logger.info("Configured: %s (dataset=%d, ingest=%d)", source.name, dataset.id, ingest.id);
    }

    // Trigger imports if requested
    if (shouldTrigger) {
      logger.info("Triggering imports for %d datasets...", created.length);
      for (const item of created) {
        await triggerImport(payload, item.ingestId);
      }

      logger.info("All imports queued. They will be processed by the job runner.");
    } else {
      logger.info(
        "Created %d scheduled ingests (disabled). Use --trigger to import now, or enable them in the dashboard.",
        created.length
      );
    }

    // Summary
    logger.info("=== Demo Data Summary ===");
    for (const item of created) {
      logger.info("  %s (dataset=%d, ingest=%d)", item.name, item.datasetId, item.ingestId);
    }
  } catch (error) {
    logError(error, "Failed to load demo data");
    process.exit(1);
  } finally {
    if (payload.db?.pool != null && (payload.db.pool as { ended?: boolean }).ended !== true) {
      try {
        await (payload.db.pool as { end?: () => Promise<void> }).end?.();
      } catch {
        // Connection pool will be cleaned up on process exit
      }
    }
  }
};

const run = async () => {
  await main();
  process.exit(0);
};

void run();
