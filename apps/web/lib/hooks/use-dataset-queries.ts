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

import type { HttpError } from "../api/http-error";
import { fetchJson } from "../api/http-error";
import type { SchemaInferenceOptions, SchemaInferenceResponse } from "../types/schema-inference";

export type { SchemaInferenceOptions, SchemaInferenceResponse } from "../types/schema-inference";

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

  return useMutation<SchemaInferenceResponse, HttpError, { datasetId: number } & SchemaInferenceOptions>({
    mutationFn: async ({ datasetId, ...options }) => {
      return fetchJson<SchemaInferenceResponse>(`/api/v1/datasets/${datasetId}/schema/infer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
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
