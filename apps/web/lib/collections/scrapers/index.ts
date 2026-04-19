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
import { beforeChangeHooks } from "./hooks";

const Scrapers: CollectionConfig = {
  slug: "scrapers",
  ...createCommonConfig({ versions: false, drafts: false }),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "runtime", "enabled", "lastRunStatus", "updatedAt"],
    group: "Scrapers",
  },
  access: scrapersAccess,
  fields: scraperFields,
  hooks: { beforeChange: beforeChangeHooks },
};

export default Scrapers;
