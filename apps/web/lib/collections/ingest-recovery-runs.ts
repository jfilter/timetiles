/**
 * Defines the Payload CMS collection for the history of ingest recovery runs.
 *
 * The scheduled recovery job records what recovery would do with abandoned
 * ingest jobs; `timetiles ingest recover --apply` records what it did. A run
 * without findings writes no row. See ADR 0043.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { isAdmin } from "./shared-fields";

const IngestRecoveryRuns: CollectionConfig = {
  slug: "ingest-recovery-runs",
  timestamps: true,
  admin: { useAsTitle: "id", defaultColumns: ["mode", "found", "applied", "skipped", "createdAt"], group: "System" },
  // Written by recovery only.
  access: { read: isAdmin, create: () => false, update: () => false, delete: isAdmin },
  fields: [
    {
      name: "mode",
      type: "select",
      required: true,
      options: [
        { label: "Report", value: "report" },
        { label: "Apply", value: "apply" },
      ],
    },
    { name: "found", type: "number", required: true, min: 0 },
    { name: "applied", type: "number", required: true, min: 0 },
    { name: "skipped", type: "number", required: true, min: 0 },
    { name: "findings", type: "json", required: true },
  ],
};

export default IngestRecoveryRuns;
