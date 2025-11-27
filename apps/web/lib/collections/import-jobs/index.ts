/**
 * Defines the Payload CMS collection configuration for Import Jobs.
 *
 * This collection is the heart of the data import pipeline. Each document represents a single,
 * discrete import job for a specific dataset (or a sheet within a file). It tracks the entire
 * lifecycle of the import process through a series of stages, from initial deduplication to
 * final event creation.
 *
 * Key responsibilities of this collection include:
 * - Managing the current processing `stage` of the import.
 * - Storing detailed results from each stage, such as duplicate analysis, schema detection, and validation.
 * - Tracking progress, errors, and final results.
 * - Orchestrating the pipeline by triggering the next job in the sequence via `afterChange` hooks.
 * - Enforcing valid stage transitions to maintain pipeline integrity.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This file uses complex hooks with nested Payload operations.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig } from "../shared-fields";
import { importJobsAccess } from "./access-control";
import { importJobFields } from "./fields";
import { afterChangeHooks, beforeChangeHooks } from "./hooks";

const ImportJobs: CollectionConfig = {
  slug: "import-jobs",
  ...createCommonConfig({
    drafts: false,
    versions: true,
  }),
  admin: {
    useAsTitle: "id",
    defaultColumns: ["dataset", "stage", "progress", "createdAt"],
    group: "Import",
    description: "Unified import processing pipeline",
  },
  access: importJobsAccess,
  fields: importJobFields,
  hooks: {
    beforeChange: beforeChangeHooks,
    afterChange: afterChangeHooks,
  },
};

export default ImportJobs;
