/**
 * Maps a ScheduledIngest document to the shape needed by the wizard's
 * {@link initializeForEdit} action.
 *
 * @module
 * @category Components
 */
import type { UrlAuthConfig } from "@/lib/ingest/types/wizard";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScheduledIngest } from "@/payload-types";

import type { EditScheduleData, JsonApiConfig, ScheduleConfig } from "./wizard-store";

// Credentials are decrypted by Payload afterRead hooks and returned to the owner.
// They are held in Zustand memory (never persisted to localStorage) and sent back
// on update. This round-trip is acceptable since the user owns these credentials.
const mapAuthConfig = (auth: ScheduledIngest["authConfig"]): UrlAuthConfig | null => {
  if (!auth?.type || auth.type === "none") return null;
  return {
    type: auth.type,
    apiKey: auth.apiKey ?? "",
    apiKeyHeader: auth.apiKeyHeader ?? "X-API-Key",
    bearerToken: auth.bearerToken ?? "",
    username: auth.username ?? "",
    password: auth.password ?? "",
  };
};

const mapJsonApiConfig = (opts: ScheduledIngest["advancedOptions"]): JsonApiConfig | null => {
  const cfg = opts?.jsonApiConfig;
  if (!cfg) return null;
  const p = cfg.pagination;
  return {
    recordsPath: cfg.recordsPath ?? undefined,
    pagination: p?.enabled
      ? {
          enabled: true,
          type: p.type ?? "page",
          pageParam: p.pageParam ?? undefined,
          limitParam: p.limitParam ?? undefined,
          limitValue: p.limitValue ?? undefined,
          maxPages: p.maxPages ?? undefined,
          totalPath: p.totalPath ?? undefined,
          nextCursorPath: p.nextCursorPath ?? undefined,
        }
      : undefined,
  };
};

/**
 * Transform a fetched ScheduledIngest (depth=1) into wizard edit state.
 */
export const mapScheduleToEditData = (schedule: ScheduledIngest): EditScheduleData => {
  const catalogId = extractRelationId(schedule.catalog);
  if (catalogId == null) {
    throw new Error("scheduled ingest is missing a catalog");
  }

  const scheduleConfig: ScheduleConfig = {
    enabled: true,
    name: schedule.name,
    scheduleType: schedule.scheduleType,
    frequency: schedule.frequency ?? "daily",
    cronExpression: schedule.cronExpression ?? "",
    schemaMode: schedule.schemaMode ?? "additive",
  };

  // Extract existing dataset ID (single-sheet) or null (multi-sheet not yet supported in edit)
  const datasetId = extractRelationId(schedule.dataset) ?? null;

  return {
    sourceUrl: schedule.sourceUrl,
    authConfig: mapAuthConfig(schedule.authConfig),
    jsonApiConfig: mapJsonApiConfig(schedule.advancedOptions),
    selectedCatalogId: catalogId,
    scheduleConfig,
    datasetId,
  };
};
