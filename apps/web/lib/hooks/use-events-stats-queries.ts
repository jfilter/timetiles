/**
 * Aggregated event counts grouped by catalog or dataset, for the bar charts.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { AggregateResponse } from "@/lib/schemas/events";

import { fetchJson } from "../api/http-error";
import { createLogger } from "../logger";
import type { FilterState } from "../types/filter-state";
import type { BoundsType, ViewScope } from "../utils/event-params";
import { buildEventParams } from "../utils/event-params";
import type { ChartQueryResult } from "./events-chart-query";
import { withChartFlags } from "./events-chart-query";
import { eventsQueryKeys } from "./events-query-keys";
import { QUERY_PRESETS } from "./query-presets";

const logger = createLogger("EventsQueries");

// Fetch function for unified aggregation endpoint
const fetchAggregation = async (
  filters: FilterState,
  bounds: BoundsType,
  groupBy: "catalog" | "dataset",
  signal?: AbortSignal,
  scope?: ViewScope
): Promise<AggregateResponse> => {
  const params = buildEventParams(filters, bounds, { groupBy }, scope);
  const url = `/api/v1/events/stats?${params.toString()}`;

  logger.debug("Fetching aggregation", { env: process.env.NODE_ENV, groupBy });

  return fetchJson<AggregateResponse>(url, { signal });
};

// Unified aggregation query hook
export const useEventsAggregationQuery = (
  filters: FilterState,
  bounds: BoundsType,
  groupBy: "catalog" | "dataset",
  enabled: boolean = true,
  scope?: ViewScope
): ChartQueryResult<AggregateResponse> =>
  withChartFlags(
    useQuery({
      queryKey: eventsQueryKeys.aggregation(filters, bounds, groupBy, scope),
      queryFn: ({ signal }) => fetchAggregation(filters, bounds, groupBy, signal, scope),
      enabled: enabled && bounds != null,
      ...QUERY_PRESETS.expensive,

      placeholderData: (previousData) => previousData,
    })
  );
