/**
 * Defines the Payload CMS collection for event quota reservations.
 *
 * One row per IngestJob generation: the number of new events currently charged
 * to the owner's `TOTAL_EVENTS` usage for that generation, and whether it is settled. The ledger in
 * `lib/ingest/event-quota-ledger.ts` changes a row and the usage in one
 * transaction, so a crash or a retry can never charge an attempt twice. See ADR 0043.
 *
 * @module
 * @category Collections
 */
import type { CollectionConfig } from "payload";

import { isAdmin } from "./shared-fields";

const QuotaReservations: CollectionConfig = {
  slug: "quota-reservations",
  timestamps: true,
  admin: {
    useAsTitle: "id",
    defaultColumns: ["ingestJob", "generation", "user", "amount", "updatedAt"],
    group: "System",
    hidden: true,
  },
  // Written by the pipeline only.
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: "ingestJob", type: "relationship", relationTo: "ingest-jobs", index: true },
    { name: "generation", type: "number", required: true },
    { name: "user", type: "relationship", relationTo: "users", index: true },
    { name: "amount", type: "number", required: true, min: 0 },
    // A settled charge counts committed events; an unsettled one is a reservation.
    { name: "settled", type: "checkbox", defaultValue: false, required: true },
  ],
  indexes: [{ fields: ["ingestJob", "generation"], unique: true }],
};

export default QuotaReservations;
