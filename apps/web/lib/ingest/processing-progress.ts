/**
 * Transform API progress into the import wizard's display state.
 * @module
 * @category Services
 */
import type { ProgressApiResponse } from "./types/progress-tracking";

// Transform API response to internal progress state
export const transformProgressResponse = (data: ProgressApiResponse) => {
  const currentJob = data.jobs.find((job) => job.overallProgress < 100) ?? data.jobs[0];
  // Null (not the literal "Processing") when no stage is known: the render maps
  // known stages through STAGE_I18N_KEYS and falls back to the translated
  // t("processingLabel") on a nullish value — a literal here would leak raw
  // English past that mapping.
  const currentStage = currentJob?.currentStage ?? null;

  return {
    status: data.status,
    progress: data.overallProgress,
    currentStage,
    error: data.errorLog ?? undefined,
    catalogId: data.catalogId ?? undefined,
    datasets:
      data.status === "completed"
        ? data.jobs.map((job) => ({
            id: typeof job.datasetId === "string" ? Number.parseInt(job.datasetId, 10) : job.datasetId,
            // Only the renderer knows the locale for unnamed datasets.
            name: job.datasetName ?? null,
            eventsCount: job.results?.totalEvents ?? 0,
          }))
        : undefined,
    stages: currentJob?.stages ?? [],
    needsReviewJob: data.jobs.find((job) => job.currentStage === "needs-review" && job.reviewReason) ?? null,
  };
};
