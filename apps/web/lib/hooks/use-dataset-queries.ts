/**
 * React Query hooks for dataset-related operations.
 *
 * This module provides hooks for interacting with datasets, including
 * schema inference and other dataset management operations.
 *
 * @module
 * @category Hooks
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface SchemaInferenceOptions {
  /** Maximum number of events to sample (default: 500) */
  sampleSize?: number;
  /** Number of events to process per batch (default: 100) */
  batchSize?: number;
  /** Generate schema even if one already exists and is fresh (default: false) */
  forceRegenerate?: boolean;
}

interface SchemaInferenceResponse {
  success: boolean;
  generated: boolean;
  message: string;
  eventsSampled?: number;
  schema: {
    id: number;
    versionNumber: number;
    createdAt: string;
    eventCountAtCreation?: number;
  } | null;
}

/**
 * Hook for triggering schema inference on a dataset.
 *
 * This mutation analyzes existing events in a dataset and generates
 * a schema version. Useful for datasets created via seeding or direct
 * API event creation.
 *
 * @example
 * ```tsx
 * const { mutate: inferSchema, isPending } = useInferSchemaForDataset();
 *
 * const handleInferSchema = () => {
 *   inferSchema({ datasetId: 123, forceRegenerate: true });
 * };
 * ```
 */
export const useInferSchemaForDataset = () => {
  const queryClient = useQueryClient();

  return useMutation<SchemaInferenceResponse, Error, { datasetId: number } & SchemaInferenceOptions>({
    mutationFn: async ({ datasetId, ...options }) => {
      const response = await fetch(`/api/v1/datasets/${datasetId}/schema/infer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Failed to infer schema: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries when schema is generated
      if (data.generated) {
        void queryClient.invalidateQueries({ queryKey: ["dataset-schemas", variables.datasetId] });
        void queryClient.invalidateQueries({ queryKey: ["datasets", variables.datasetId] });
      }
    },
  });
};
