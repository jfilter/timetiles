/**
 * Unit tests for the ingest review panel.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it, vi } from "vitest";

import { ReviewPanel } from "@/components/ingest/review-panel";
import { REVIEW_REASONS } from "@/lib/constants/review-reasons";

import { renderWithProviders, screen, userEvent } from "../../setup/unit/react-render";

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

describe("ReviewPanel", () => {
  it("approves no-location reviews with both location and locationName overrides", async () => {
    approveMutate.mockReset();
    const user = userEvent.setup();

    renderWithProviders(<ReviewPanel job={createJob()} />);

    await user.click(screen.getByRole("button", { name: "venue_name" }));
    await user.click(screen.getByRole("button", { name: "Use selected column" }));

    expect(approveMutate).toHaveBeenCalledWith({
      ingestJobId: "job-123",
      locationPath: "venue_name",
      locationNamePath: "venue_name",
    });
  });
});
