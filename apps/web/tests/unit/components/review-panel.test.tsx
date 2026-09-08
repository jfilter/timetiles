/**
 * Unit tests for the ingest review panel.
 *
 * @module
 * @category Tests
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ReviewPanel } from "@/components/ingest/review-panel";
import { REVIEW_REASONS } from "@/lib/constants/review-reasons";

import { renderWithProviders, userEvent, within } from "../../setup/unit/react-render";

const approveMutate = vi.fn();

// jsdom does not implement pointer capture or layout scrolling.
beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    scrollIntoView: { configurable: true, value: () => undefined },
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

vi.mock("@/lib/hooks/use-ingest-approval", () => ({
  useApproveIngestJobMutation: () => ({ mutate: approveMutate, isPending: false, isError: false, error: null }),
}));

const createJob = () => ({
  id: "job-123",
  datasetId: "dataset-1",
  currentStage: "needs-review",
  overallProgress: 0,
  estimatedCompletionTime: null,
  stages: [],
  errors: 0,
  duplicates: { internal: 0, external: 0 },
  reviewReason: REVIEW_REASONS.NO_LOCATION_DETECTED,
  reviewDetails: { message: "No location fields detected.", availableColumns: ["", "venue_name"] },
  schemaValidation: null,
  results: null,
});

/** A job paused on the ambiguous date-order gate for the END date column. */
const createEndDateOrderJob = () => ({
  ...createJob(),
  reviewReason: REVIEW_REASONS.AMBIGUOUS_DATE_ORDER,
  reviewDetails: {
    message: "An end-date column was detected, but its order could not be determined.",
    // The end-date gate stores the path under `endTimestampPath` (the start gate
    // would store it under `timestampPath`); this is the panel's discriminator.
    endTimestampPath: "end_date",
  },
});

/** A job paused on the ambiguous date-order gate for the START date column. */
const createStartDateOrderJob = () => ({
  ...createJob(),
  reviewReason: REVIEW_REASONS.AMBIGUOUS_DATE_ORDER,
  reviewDetails: {
    message: "A date column was detected, but its order could not be determined.",
    timestampPath: "start_date",
  },
});

// These tests share the approval mock and query dropdown portals in the document.
describe.sequential("ReviewPanel", () => {
  it("shows the full row error count and rate rather than the retained detail count", () => {
    const job = {
      ...createJob(),
      errors: 500,
      reviewReason: REVIEW_REASONS.HIGH_ROW_ERROR_RATE,
      reviewDetails: { errorCount: 600, totalEvents: 200, errorRate: 0.75 },
    };
    const { container } = renderWithProviders(<ReviewPanel job={job} />);

    expect(within(container).getByText("600")).toBeInTheDocument();
    expect(within(container).getByText("75%")).toBeInTheDocument();
    expect(within(container).queryByText("500")).not.toBeInTheDocument();
  });

  it("approves no-location reviews with both location and locationName overrides", async () => {
    approveMutate.mockReset();
    const user = userEvent.setup();

    const { container } = renderWithProviders(<ReviewPanel job={createJob()} />);

    await user.click(within(container).getByRole("combobox"));
    await user.keyboard("{ArrowDown}");
    await user.click(await within(document.body).findByRole("option", { name: "venue_name" }));
    await user.click(within(container).getByRole("button", { name: "Use selected column" }));

    expect(approveMutate).toHaveBeenCalledWith({
      ingestJobId: "job-123",
      locationPath: "venue_name",
      locationNamePath: "venue_name",
    });
  });

  it("approves an ambiguous END-date order with endTimestampOrder (not timestampOrder)", async () => {
    approveMutate.mockReset();
    const user = userEvent.setup();

    const { container } = renderWithProviders(<ReviewPanel job={createEndDateOrderJob()} />);

    await user.click(within(container).getByRole("combobox"));
    await user.keyboard("{ArrowDown}");
    await user.click(await within(document.body).findByRole("option", { name: "D/M" }));
    await user.click(within(container).getByRole("button", { name: "Use selected order" }));

    expect(approveMutate).toHaveBeenCalledWith({ ingestJobId: "job-123", endTimestampOrder: "D/M" });
  });

  it("approves an ambiguous START-date order with timestampOrder (not endTimestampOrder)", async () => {
    approveMutate.mockReset();
    const user = userEvent.setup();

    const { container } = renderWithProviders(<ReviewPanel job={createStartDateOrderJob()} />);

    await user.click(within(container).getByRole("combobox"));
    await user.keyboard("{ArrowDown}");
    await user.click(await within(document.body).findByRole("option", { name: "M/D" }));
    await user.click(within(container).getByRole("button", { name: "Use selected order" }));

    expect(approveMutate).toHaveBeenCalledWith({ ingestJobId: "job-123", timestampOrder: "M/D" });
  });

  it("flips the dataset to best-effort when continuing without picking a date order", async () => {
    approveMutate.mockReset();
    const user = userEvent.setup();

    const { container } = renderWithProviders(<ReviewPanel job={createStartDateOrderJob()} />);

    // The without-order button no longer drops dates; it makes per-row guessing
    // sticky by flipping ambiguityResolution to "best-effort".
    await user.click(within(container).getByRole("button", { name: "Continue, best-guess dates" }));

    expect(approveMutate).toHaveBeenCalledWith({ ingestJobId: "job-123", ambiguityResolution: "best-effort" });
  });
});
