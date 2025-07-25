import type { CollectionConfig } from "payload";

import { basicFields } from "./imports/basic-fields";
import { coordinateFields } from "./imports/coordinate-fields";
import { geocodingFields } from "./imports/geocoding-fields";
import { jobFields } from "./imports/job-fields";
import { progressFields } from "./imports/progress-fields";

const Imports: CollectionConfig = {
  slug: "imports",
  admin: {
    useAsTitle: "originalName",
    defaultColumns: ["originalName", "catalog", "status", "processingStage", "progress", "createdAt"],
  },
  access: {
    read: () => true, // Will be handled in API endpoints
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [...basicFields, ...progressFields, ...geocodingFields, ...jobFields, ...coordinateFields],
  timestamps: true,
};

export default Imports;
