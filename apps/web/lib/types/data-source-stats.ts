/**
 * Shared types for the data source stats API and its consumers.
 *
 * These types describe the event-count-per-source response returned by
 * the `/api/v1/sources/stats` endpoint. They live here (rather than in
 * the route file) so that both server and client code can import them
 * without creating a dependency from hooks/components into route modules.
 *
 * @module
 * @category Types
 */

/**
 * Response format for data source stats endpoint.
 */
export interface DataSourceStatsResponse {
  catalogCounts: Record<string, number>;
  datasetCounts: Record<string, number>;
  totalEvents: number;
}
