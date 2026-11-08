/**
 * Defines the Payload CMS collection for ingest runs.
 *
 * One row per source run (upload, scheduled fetch, scraper output): the file it
 * split into sheets, whether every sheet job was dispatched, the derived outcome,
 * and whether the source bookkeeping has run. See ADR 0043.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { INGEST_RUN_OUTCOMES, INGEST_RUN_SOURCES } from "@/lib/constants/ingest-constants";

import { isEditorOrAdmin } from "./shared-fields";

const IngestRuns: CollectionConfig = {
  slug: "ingest-runs",
  timestamps: true,
  admin: {
    useAsTitle: "id",
    defaultColumns: ["source", "ingestFile", "outcome", "createdAt"],
    group: "Import",
    description: "Source runs and their derived outcome",
  },
  // Written by the pipeline only.
  access: { read: isEditorOrAdmin, create: () => false, update: () => false, delete: isEditorOrAdmin },
  fields: [
    {
      name: "source",
      type: "select",
      required: true,
      options: INGEST_RUN_SOURCES.map((value) => ({ label: value, value })),
    },
    { name: "ingestFile", type: "relationship", relationTo: "ingest-files", unique: true },
    { name: "scheduledIngest", type: "relationship", relationTo: "scheduled-ingests", index: true },
    { name: "scraperRun", type: "relationship", relationTo: "scraper-runs" },
    { name: "expectedSheets", type: "number", required: true },
    { name: "dispatchedAt", type: "date", admin: { description: "Set once every sheet job is queued" } },
    {
      name: "outcome",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      options: INGEST_RUN_OUTCOMES.map((value) => ({ label: value, value })),
    },
    { name: "accountedAt", type: "date", admin: { description: "Set once the source bookkeeping has run" } },
    {
      name: "countedAt",
      type: "date",
      admin: { description: "Set once a completed or failed outcome entered the source statistics" },
    },
  ],
};

export default IngestRuns;
