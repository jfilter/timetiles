/**
 * Mutations that create catalogs, datasets or schedules mark the cached lists stale.
 *
 * @module
 * @category Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type UpdateScheduleParams,
  useUpdateSchedule,
} from "@/app/[locale]/(frontend)/(app)/ingest/_components/use-update-schedule";
import type * as HttpErrorModule from "@/lib/api/http-error";
import { catalogsQueryKeys } from "@/lib/hooks/use-catalogs-query";
import {
  dataPackageKeys,
  useActivateDataPackageMutation,
  useDeactivateDataPackageMutation,
} from "@/lib/hooks/use-data-packages-query";
import { dataSourcesKeys } from "@/lib/hooks/use-data-sources-query";
import { ingestFileKeys } from "@/lib/hooks/use-ingest-files-query";
import { useIngestConfigureMutation } from "@/lib/hooks/use-ingest-wizard-mutations";
import { scheduledIngestKeys } from "@/lib/hooks/use-scheduled-ingest-mutations";
import type { ConfigureIngestRequest } from "@/lib/ingest/types/wizard";

import en from "../../../../messages/en.json";

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("@/lib/api/http-error", async (importOriginal) => ({
  ...(await importOriginal<typeof HttpErrorModule>()),
  fetchJson: mocks.fetchJson,
}));

const KEYS = {
  catalogs: catalogsQueryKeys.withDatasets(),
  dataSources: dataSourcesKeys.all,
  ingestFiles: [...ingestFileKeys.all, "user", 1],
  schedules: [...scheduledIngestKeys.all, "user", 1],
  dataPackages: dataPackageKeys.all,
} as const;

const setup = <T,>(useHook: () => T) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const key of Object.values(KEYS)) client.setQueryData(key, []);
  const { result } = renderHook(useHook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    ),
  });
  const invalidated = (name: keyof typeof KEYS) => client.getQueryState(KEYS[name])?.isInvalidated;
  return { client, result, invalidated };
};

const updateParams: UpdateScheduleParams = {
  editScheduleId: 5,
  previewId: "preview-1",
  catalogId: 3,
  newCatalogName: "",
  sheetMappings: [],
  fieldMappings: [],
  deduplicationStrategy: "skip",
  geocodingEnabled: true,
  transforms: {},
  scheduleConfig: {
    enabled: true,
    name: "Weekly feed",
    scheduleType: "frequency",
    frequency: "weekly",
    cronExpression: "",
    schemaMode: "additive",
  },
  authConfig: null,
  jsonApiConfig: null,
};

describe("ingest target invalidation", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("a configured import refreshes catalogs, data sources, imports and schedules", async () => {
    mocks.fetchJson.mockResolvedValue({ ingestFileId: 1 });
    const { client, result, invalidated } = setup(useIngestConfigureMutation);

    await act(async () => {
      await result.current.mutateAsync({} as ConfigureIngestRequest);
    });

    expect(invalidated("catalogs")).toBe(true);
    expect(invalidated("dataSources")).toBe(true);
    expect(invalidated("ingestFiles")).toBe(true);
    expect(invalidated("schedules")).toBe(true);
    client.clear();
  });

  it("a failed configuration leaves the cached lists alone", async () => {
    mocks.fetchJson.mockRejectedValue(new Error("Invalid"));
    const { client, result, invalidated } = setup(useIngestConfigureMutation);

    await act(async () => {
      await expect(result.current.mutateAsync({} as ConfigureIngestRequest)).rejects.toThrow("Invalid");
    });

    expect(invalidated("catalogs")).toBe(false);
    client.clear();
  });

  it("an activated data package refreshes catalogs, data sources and schedules", async () => {
    mocks.fetchJson.mockResolvedValue({ catalogId: 1, datasetId: 2, scheduledIngestId: 3 });
    const { client, result, invalidated } = setup(useActivateDataPackageMutation);

    await act(async () => {
      await result.current.mutateAsync({ slug: "pkg" });
    });

    expect(invalidated("dataPackages")).toBe(true);
    expect(invalidated("catalogs")).toBe(true);
    expect(invalidated("dataSources")).toBe(true);
    expect(invalidated("schedules")).toBe(true);
    client.clear();
  });

  it("a saved schedule edit refreshes schedules, catalogs and data sources", async () => {
    mocks.fetchJson.mockResolvedValue({ success: true });
    const { client, result, invalidated } = setup(useUpdateSchedule);

    await act(async () => {
      result.current.updateSchedule(updateParams);
      await vi.waitFor(() => expect(mocks.fetchJson).toHaveBeenCalledTimes(1));
    });

    await vi.waitFor(() => expect(invalidated("schedules")).toBe(true));
    expect(invalidated("catalogs")).toBe(true);
    expect(invalidated("dataSources")).toBe(true);
    client.clear();
  });

  it("a deactivated data package refreshes the schedules it disabled", async () => {
    mocks.fetchJson.mockResolvedValue(undefined);
    const { client, result, invalidated } = setup(useDeactivateDataPackageMutation);

    await act(async () => {
      await result.current.mutateAsync("pkg");
    });

    expect(invalidated("dataPackages")).toBe(true);
    expect(invalidated("schedules")).toBe(true);
    client.clear();
  });
});
