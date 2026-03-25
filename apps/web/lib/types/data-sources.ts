/**
 * Shared types for the data sources API and its consumers.
 *
 * These types describe the lightweight catalog/dataset data returned by
 * the `/api/v1/data-sources` endpoint. They live here (rather than in the
 * route file) so that both server and client code can import them without
 * creating a dependency from hooks/components into route modules.
 *
 * @module
 * @category Types
 */

export interface DataSourceCatalog {
  id: number;
  name: string;
  isOwned: boolean;
}

export interface DataSourceDataset {
  id: number;
  name: string;
  catalogId: number | null;
  hasTemporalData: boolean;
}

export interface DataSourcesResponse {
  catalogs: DataSourceCatalog[];
  datasets: DataSourceDataset[];
}
