/**
 * Defines the Payload CMS collection configuration for Import Files.
 *
 * This collection acts as a record for every file uploaded to the system for data import.
 * It leverages Payload's `upload` functionality to store the file itself, while also tracking
 * extensive metadata about the import process, such as:
 * - The original filename and system filename.
 * - The user or session that initiated the import.
 * - The overall status of the import (e.g., pending, parsing, completed, failed).
 * - Information about the datasets detected within the file.
 * - A reference to the background job responsible for processing the file.
 *
 * An `afterChange` hook is used to automatically queue the `manual-ingest` workflow
 * as soon as a new file is uploaded and created in this collection.
 *
 * @module
 */
import type { CollectionConfig } from "payload";

import { getEnv } from "@/lib/config/env";

import { createCommonConfig } from "../shared-fields";
import { ingestFilesAccess } from "./access";
import { ingestFileFields } from "./fields";
import {
  afterChangeHooks,
  afterErrorHooks,
  ALLOWED_MIME_TYPES,
  beforeChangeHooks,
  beforeOperationHooks,
  beforeValidateHooks,
} from "./hooks";

// Note: File size limits are enforced per user's trust level via quota service in beforeValidate hook

const IngestFiles: CollectionConfig = {
  slug: "ingest-files",
  ...createCommonConfig({ drafts: false }),
  upload: { staticDir: `${getEnv().UPLOAD_DIR}/ingest-files`, mimeTypes: ALLOWED_MIME_TYPES },
  admin: {
    useAsTitle: "originalName", // Use original user-friendly filename
    defaultColumns: ["originalName", "catalog", "status", "datasetsCount", "createdAt", "user"],
    group: "Import",
  },
  access: ingestFilesAccess,
  fields: ingestFileFields,
  hooks: {
    beforeOperation: beforeOperationHooks,
    beforeValidate: beforeValidateHooks,
    beforeChange: beforeChangeHooks,
    afterChange: afterChangeHooks,
    afterError: afterErrorHooks,
  },
};

export default IngestFiles;
