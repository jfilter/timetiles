/**
 * Single-event query behind the detail modal.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { Event } from "@/payload-types";

import { fetchJson, HttpError } from "../api/http-error";
import { createLogger } from "../logger";
import { eventsQueryKeys } from "./events-query-keys";
import { QUERY_PRESETS } from "./query-presets";

const logger = createLogger("EventsQueries");

// Fetch function for single event by ID
const fetchEventById = async (eventId: number, signal?: AbortSignal): Promise<Event> => {
  logger.debug("Fetching event by ID", { eventId });

  return fetchJson<Event>(`/api/events/${eventId}?depth=2`, { signal });
};

/**
 * Hook to fetch a single event by ID.
 *
 * Used by the event detail modal to fetch full event data when
 * clicking on an event card.
 *
 * @param eventId - The event database ID to fetch
 * @returns React Query result with event data
 */
export const useEventDetailQuery = (eventId: number | null) =>
  useQuery({
    queryKey: eventsQueryKeys.detail(eventId ?? 0),
    queryFn: ({ signal }) => fetchEventById(eventId ?? 0, signal),
    enabled: eventId != null,
    ...QUERY_PRESETS.stable,
    retry: (failureCount, error) => {
      // Don't retry if event not found
      if (error instanceof HttpError && error.status === 404) {
        return false;
      }
      return failureCount < 2;
    },
  });
