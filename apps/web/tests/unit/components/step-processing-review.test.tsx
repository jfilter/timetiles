/**
 * Processing step: consecutive review pauses, the "View on map" target and stage legibility.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormattedJobProgress, FormattedStage, ProgressApiResponse } from "@/lib/ingest/types/progress-tracking";

const mocks = vi.hoisted(() => ({ progress: undefined as unknown, push: vi.fn() }));
vi.mock("@/lib/hooks/use-ingest-progress-query", () => ({
  useIngestProgressQuery: () => ({ data: mocks.progress, error: null }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { StepProcessing } from "@/app/[locale]/(frontend)/(app)/ingest/_components/steps/step-processing";
import { initialState } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-state";
import { useWizardStore } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-store";
import { REVIEW_REASONS } from "@/lib/constants/review-reasons";

import { renderWithProviders, screen, userEvent, waitFor } from "../../setup/unit/react-render";

const job = (overrides: Partial<FormattedJobProgress>): FormattedJobProgress => ({
  id: 1,
  datasetId: 10,
  currentStage: "needs-review",
  overallProgress: 50,
  estimatedCompletionTime: null,
  stages: [],
  errors: 0,
  duplicates: { internal: 0, external: 0 },
  ...overrides,
});

const response = (status: ProgressApiResponse["status"], jobs: FormattedJobProgress[]): ProgressApiResponse => ({
  type: "ingest-file",
  id: 1,
  status,
  originalName: "events.xlsx",
  catalogId: 4,
  datasetsCount: jobs.length,
  datasetsProcessed: 0,
  overallProgress: 50,
  estimatedCompletionTime: null,
  jobs,
});

const duplicateReview = (id: number, datasetId: number) =>
  job({
    id,
    datasetId,
    reviewReason: REVIEW_REASONS.HIGH_DUPLICATE_RATE,
    reviewDetails: { totalRows: 10, uniqueRows: 2, duplicateRate: 0.8 },
  });

describe("StepProcessing", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    mocks.push.mockReset();
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json({ message: "ok" }));
    useWizardStore.setState({ ...initialState, _initialized: true, currentStep: 7, ingestFileId: 1 });
  });

  afterEach(() => {
    useWizardStore.setState({ ...initialState, _initialized: false, _savedAt: 0 });
    localStorage.clear();
  });

  it("offers a fresh decision when the next sheet pauses for review after an approval", async () => {
    const user = userEvent.setup();
    mocks.progress = response("processing", [duplicateReview(1, 10), duplicateReview(2, 11)]);
    const { rerender } = renderWithProviders(<StepProcessing />);

    await user.click(screen.getByRole("button", { name: "Import anyway" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Import anyway" })).toBeDisabled());

    mocks.progress = response("processing", [job({ id: 1, currentStage: "geocoding" }), duplicateReview(2, 11)]);
    rerender(<StepProcessing />);

    expect(screen.getByRole("button", { name: "Import anyway" })).toBeEnabled();
  });

  it("opens the map filtered to the imported datasets", async () => {
    const user = userEvent.setup();
    mocks.progress = response("completed", [
      job({ id: 1, datasetId: 10, currentStage: "completed", overallProgress: 100 }),
      job({ id: 2, datasetId: 11, currentStage: "completed", overallProgress: 100 }),
    ]);
    renderWithProviders(<StepProcessing />);

    await user.click(screen.getByRole("button", { name: "View on map" }));

    expect(mocks.push).toHaveBeenCalledWith("/explore?datasets=10,11");
  });

  it("renders pending and skipped stages in the muted text token, not an opacity-dimmed color", () => {
    const stage = (name: string, status: FormattedStage["status"]): FormattedStage => ({
      name,
      displayName: name,
      status,
      progress: 0,
      weight: 1,
      startedAt: null,
      completedAt: null,
      batches: { current: 0, total: 0 },
      currentBatch: { rowsProcessed: 0, rowsTotal: 0, percentage: 0 },
      performance: { rowsPerSecond: null, estimatedSecondsRemaining: null },
    });
    mocks.progress = response("processing", [
      job({
        currentStage: "analyze-duplicates",
        stages: [stage("analyze-duplicates", "in_progress"), stage("geocode-batch", "pending")],
      }),
    ]);
    renderWithProviders(<StepProcessing />);

    const pending = screen.getByText("Geocoding locations");
    expect(pending).toHaveClass("text-muted-foreground");
    expect(pending.className).not.toMatch(/\/\d+/);
  });
});
