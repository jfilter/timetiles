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
  eventsCreated: number;
  eventsTotal: number;
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
  const totalEventsCreated = data.jobs.reduce((sum, job) => sum + (job.results?.totalEvents ?? 0), 0);
  const currentJob = data.jobs.find((job) => job.overallProgress < 100);
  // Null (not the literal "Processing") when no stage is known: the render maps
  // known stages through STAGE_I18N_KEYS and falls back to the translated
  // t("processingLabel") on a nullish value — a literal here would leak raw
  // English past that mapping.
  const currentStage = currentJob?.currentStage ?? data.jobs[0]?.currentStage ?? null;

  const datasets = data.jobs.map((job) => ({
    id: typeof job.datasetId === "string" ? Number.parseInt(job.datasetId, 10) : job.datasetId,
    // Null rather than an English fallback: only the render knows the viewer's locale.
    name: job.datasetName ?? null,
    eventsCount: job.results?.totalEvents ?? 0,
  }));

  const firstJob = data.jobs[0];
  const stages = firstJob?.stages ?? [];

  return {
    status: data.status,
    progress: data.overallProgress,
    currentStage,
    eventsCreated: totalEventsCreated,
    eventsTotal: 0, // Not used during processing - we show percentage instead
    error: data.errorLog ?? undefined,
    completedAt: data.completedAt ?? undefined,
    catalogId: data.catalogId ?? undefined,
    datasets: data.status === "completed" ? datasets : undefined,
    stages,
    needsReviewJob: data.jobs.find((job) => job.reviewReason) ?? null,
  };
};
