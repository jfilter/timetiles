/**
 * Shared types for the event bounds API and its consumers.
 *
 * These types describe the bounding box response returned by the
 * `/api/v1/events/bounds` endpoint. They live here (rather than in the
 * route file) so that both server and client code can import them without
 * creating a dependency from hooks/components into route modules.
 *
 * @module
 * @category Types
 */
import type { SimpleBounds } from "@/lib/utils/event-params";

/**
 * Response format for the bounds endpoint.
 */
export interface BoundsResponse {
  /** Geographic bounds of matching events, or null if no events match */
  bounds: SimpleBounds | null;
  /** Total count of events within bounds */
  count: number;
}
