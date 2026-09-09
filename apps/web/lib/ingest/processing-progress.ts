/**
 * Transform API progress into the import wizard's display state.
 * @module
 * @category Services
 */
import type { IngestFileStatus } from "@/lib/constants/ingest-constants";

import type { FormattedStage, ProgressApiResponse } from "./types/progress-tracking";

// Internal progress state
export interface ImportProgress {
  status: IngestFileStatus;
  progress: number;
  currentStage: string | null;
  error?: string;
  completedAt?: string;
  catalogId?: number;
  datasets?: Array<{ id: number; name: string | null; eventsCount: number }>;
  stages: FormattedStage[];
  /** Job requiring review (if any). */
  needsReviewJob?: ProgressApiResponse["jobs"][0] | null;
}

// Transform API response to internal progress state
export const transformProgressResponse = (data: ProgressApiResponse): ImportProgress => {
  const currentJob = data.jobs.find((job) => job.overallProgress < 100) ?? data.jobs[0];
  // Null (not the literal "Processing") when no stage is known: the render maps
  // known stages through STAGE_I18N_KEYS and falls back to the translated
  // t("processingLabel") on a nullish value — a literal here would leak raw
  // English past that mapping.
  const currentStage = currentJob?.currentStage ?? null;

  const datasets = data.jobs.map((job) => ({
    id: typeof job.datasetId === "string" ? Number.parseInt(job.datasetId, 10) : job.datasetId,
    // Null rather than an English fallback: only the render knows the viewer's locale.
    name: job.datasetName ?? null,
    eventsCount: job.results?.totalEvents ?? 0,
  }));

  return {
    status: data.status,
    progress: data.overallProgress,
    currentStage,
    error: data.errorLog ?? undefined,
    completedAt: data.completedAt ?? undefined,
    catalogId: data.catalogId ?? undefined,
    datasets: data.status === "completed" ? datasets : undefined,
    stages: currentJob?.stages ?? [],
    needsReviewJob: data.jobs.find((job) => job.currentStage === "needs-review" && job.reviewReason) ?? null,
  };
};
