/**
 * Barrel export for all Payload CMS workflow definitions.
 *
 * @module
 * @category Jobs
 */
export { ingestProcessWorkflow } from "./ingest-process";
export { manualIngestWorkflow } from "./manual-ingest";
export { scheduledIngestWorkflow } from "./scheduled-ingest";
export { scraperIngestWorkflow } from "./scraper-ingest";

import { ingestProcessWorkflow } from "./ingest-process";
import { manualIngestWorkflow } from "./manual-ingest";
import { scheduledIngestWorkflow } from "./scheduled-ingest";
import { scraperIngestWorkflow } from "./scraper-ingest";

/** All ingest workflows, registered in Payload config. */
export const ALL_WORKFLOWS = [
  manualIngestWorkflow,
  scheduledIngestWorkflow,
  scraperIngestWorkflow,
  ingestProcessWorkflow,
];
