/**
 * Unit tests for the ingest review panel.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it, vi } from "vitest";

import { ReviewPanel } from "@/components/ingest/review-panel";
import { REVIEW_REASONS } from "@/lib/constants/review-reasons";

import { renderWithProviders, userEvent, within } from "../../setup/unit/react-render";

const approveMutate = vi.fn();

vi.mock("@/lib/hooks/use-ingest-approval", () => ({
  useApproveIngestJobMutation: () => ({ mutate: approveMutate, isPending: false, isError: false, error: null }),
}));

vi.mock("@timetiles/ui/components/select", async () => {
  const React = await import("react");

  type SelectContextValue = { value: string; onValueChange: (value: string) => void };

  const SelectContext = React.createContext<SelectContextValue>({ value: "", onValueChange: () => undefined });

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => (
      <SelectContext.Provider value={{ value: value ?? "", onValueChange: onValueChange ?? (() => undefined) }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const { value } = React.useContext(SelectContext);
      return <span>{value || placeholder}</span>;
    },
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const { onValueChange } = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

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
  reviewDetails: { message: "No location fields detected.", availableColumns: ["venue_name"] },
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

// Sequential: these tests share a module-level `approveMutate` mock and the
// jsdom document, so they must not run concurrently (the global vitest config
// sets `sequence.concurrent: true`).
describe.sequential("ReviewPanel", () => {
  it("approves no-location reviews with both location and locationName overrides", async () => {
    approveMutate.mockReset();
    const user = userEvent.setup();

    // Scope queries to this render's container — tests in this file run
    // concurrently and share the document, so the global `screen` would match
    // sibling renders.
    const { container } = renderWithProviders(<ReviewPanel job={createJob()} />);

    await user.click(within(container).getByRole("button", { name: "venue_name" }));
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

    await user.click(within(container).getByRole("button", { name: "D/M" }));
    await user.click(within(container).getByRole("button", { name: "Use selected order" }));

    expect(approveMutate).toHaveBeenCalledWith({ ingestJobId: "job-123", endTimestampOrder: "D/M" });
  });

  it("approves an ambiguous START-date order with timestampOrder (not endTimestampOrder)", async () => {
    approveMutate.mockReset();
    const user = userEvent.setup();

    const { container } = renderWithProviders(<ReviewPanel job={createStartDateOrderJob()} />);

    await user.click(within(container).getByRole("button", { name: "M/D" }));
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
