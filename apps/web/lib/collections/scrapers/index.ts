/**
 * Defines the Payload CMS collection for individual scraper definitions.
 *
 * Each scraper belongs to a scraper-repo and defines a single entrypoint,
 * runtime, schedule, and output file. One scraper produces one CSV.
 * See ADR 0015 for full architecture.
 *
 * @category Collections
 * @module
 */
import type { CollectionConfig } from "payload";

import { createCommonConfig } from "../shared-fields";
import { scrapersAccess } from "./access";
import { scraperFields } from "./fields";
import { beforeChangeHooks, deleteScraperRunsBeforeDelete } from "./hooks";

const Scrapers: CollectionConfig = {
  slug: "scrapers",
  // trash: false — soft-deleted scrapers would keep their schedules and
  // webhook tokens live, and the required repo relationship makes a later
  // hard delete fail on the FK anyway. Deletes are real deletes (mirrors
  // scraper-runs) and cascade their runs via beforeDelete.
  ...createCommonConfig({ versions: false, drafts: false, trash: false }),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "runtime", "enabled", "lastRunStatus", "updatedAt"],
    group: "Scrapers",
  },
  access: scrapersAccess,
  fields: scraperFields,
  hooks: { beforeChange: beforeChangeHooks, beforeDelete: [deleteScraperRunsBeforeDelete] },
};

export default Scrapers;
