/**
 * Unit tests for edit-schedule-mapper.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { mapScheduleToEditData } from "@/app/[locale]/(frontend)/ingest/_components/edit-schedule-mapper";
import type { ScheduledIngest } from "@/payload-types";

const baseSchedule: ScheduledIngest = {
  id: 1,
  name: "Test Schedule",
  createdBy: 10,
  sourceUrl: "https://example.com/data.csv",
  catalog: 5,
  scheduleType: "frequency",
  frequency: "daily",
  schemaMode: "additive",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("mapScheduleToEditData", () => {
  it("maps a basic schedule to edit data", () => {
    const result = mapScheduleToEditData(baseSchedule);

    expect(result.sourceUrl).toBe("https://example.com/data.csv");
    expect(result.selectedCatalogId).toBe(5);
    expect(result.datasetId).toBeNull();
    expect(result.authConfig).toBeNull();
    expect(result.jsonApiConfig).toBeNull();
    expect(result.scheduleConfig).toEqual({
      enabled: true,
      name: "Test Schedule",
      scheduleType: "frequency",
      frequency: "daily",
      cronExpression: "",
      schemaMode: "additive",
    });
  });

  it("extracts catalog ID from expanded relation object", () => {
    const schedule = {
      ...baseSchedule,
      catalog: { id: 42, name: "My Catalog", createdAt: "", updatedAt: "" } as ScheduledIngest["catalog"],
    };
    const result = mapScheduleToEditData(schedule);
    expect(result.selectedCatalogId).toBe(42);
  });

  it("extracts dataset ID from schedule", () => {
    const schedule = { ...baseSchedule, dataset: 99 };
    const result = mapScheduleToEditData(schedule);
    expect(result.datasetId).toBe(99);
  });

  it("returns null datasetId when no dataset set", () => {
    const result = mapScheduleToEditData(baseSchedule);
    expect(result.datasetId).toBeNull();
  });

  it("throws when catalog is missing", () => {
    const schedule = { ...baseSchedule, catalog: null as unknown as ScheduledIngest["catalog"] };
    expect(() => mapScheduleToEditData(schedule)).toThrow("scheduled ingest is missing a catalog");
  });

  it("maps cron schedule type", () => {
    const schedule: ScheduledIngest = {
      ...baseSchedule,
      scheduleType: "cron",
      cronExpression: "0 6 * * 1",
      frequency: null,
    };
    const result = mapScheduleToEditData(schedule);
    expect(result.scheduleConfig.scheduleType).toBe("cron");
    expect(result.scheduleConfig.cronExpression).toBe("0 6 * * 1");
    expect(result.scheduleConfig.frequency).toBe("daily"); // defaults when null
  });

  it("defaults schemaMode to additive when null", () => {
    const schedule = { ...baseSchedule, schemaMode: null } as unknown as ScheduledIngest;
    const result = mapScheduleToEditData(schedule);
    expect(result.scheduleConfig.schemaMode).toBe("additive");
  });

  describe("auth config mapping", () => {
    it("returns null for no auth", () => {
      const schedule = { ...baseSchedule, authConfig: { type: "none" as const } };
      const result = mapScheduleToEditData(schedule);
      expect(result.authConfig).toBeNull();
    });

    it("returns null when authConfig is undefined", () => {
      const schedule = { ...baseSchedule, authConfig: undefined };
      const result = mapScheduleToEditData(schedule);
      expect(result.authConfig).toBeNull();
    });

    it("maps api-key auth", () => {
      const schedule = {
        ...baseSchedule,
        authConfig: { type: "api-key" as const, apiKey: "secret123", apiKeyHeader: "X-Custom-Key" },
      };
      const result = mapScheduleToEditData(schedule);
      expect(result.authConfig).toEqual({
        type: "api-key",
        apiKey: "secret123",
        apiKeyHeader: "X-Custom-Key",
        bearerToken: "",
        username: "",
        password: "",
      });
    });

    it("maps bearer auth", () => {
      const schedule = { ...baseSchedule, authConfig: { type: "bearer" as const, bearerToken: "tok_abc" } };
      const result = mapScheduleToEditData(schedule);
      expect(result.authConfig?.type).toBe("bearer");
      expect(result.authConfig?.bearerToken).toBe("tok_abc");
    });

    it("maps basic auth", () => {
      const schedule = { ...baseSchedule, authConfig: { type: "basic" as const, username: "user", password: "pass" } };
      const result = mapScheduleToEditData(schedule);
      expect(result.authConfig?.type).toBe("basic");
      expect(result.authConfig?.username).toBe("user");
      expect(result.authConfig?.password).toBe("pass");
    });

    it("defaults apiKeyHeader to X-API-Key when null", () => {
      const schedule = { ...baseSchedule, authConfig: { type: "api-key" as const, apiKey: "key", apiKeyHeader: null } };
      const result = mapScheduleToEditData(schedule);
      expect(result.authConfig?.apiKeyHeader).toBe("X-API-Key");
    });
  });

  describe("JSON API config mapping", () => {
    it("returns null when no advancedOptions", () => {
      const result = mapScheduleToEditData(baseSchedule);
      expect(result.jsonApiConfig).toBeNull();
    });

    it("maps recordsPath without pagination", () => {
      const schedule = { ...baseSchedule, advancedOptions: { jsonApiConfig: { recordsPath: "data.items" } } };
      const result = mapScheduleToEditData(schedule);
      expect(result.jsonApiConfig?.recordsPath).toBe("data.items");
      expect(result.jsonApiConfig?.pagination).toBeUndefined();
    });

    it("maps pagination config when enabled", () => {
      const schedule = {
        ...baseSchedule,
        advancedOptions: {
          jsonApiConfig: {
            recordsPath: "results",
            pagination: {
              enabled: true,
              type: "page" as const,
              pageParam: "page",
              limitParam: "per_page",
              limitValue: 100,
              maxPages: 10,
              totalPath: "meta.total",
            },
          },
        },
      };
      const result = mapScheduleToEditData(schedule);
      expect(result.jsonApiConfig?.pagination).toEqual({
        enabled: true,
        type: "page",
        pageParam: "page",
        limitParam: "per_page",
        limitValue: 100,
        maxPages: 10,
        totalPath: "meta.total",
        nextCursorPath: undefined,
      });
    });

    it("skips pagination when not enabled", () => {
      const schedule = {
        ...baseSchedule,
        advancedOptions: { jsonApiConfig: { recordsPath: "data", pagination: { enabled: false } } },
      };
      const result = mapScheduleToEditData(schedule);
      expect(result.jsonApiConfig?.pagination).toBeUndefined();
    });
  });
});
