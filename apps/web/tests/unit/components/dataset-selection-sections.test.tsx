/**
 * Unit tests for the dataset selection step's suggestion banner and
 * per-sheet dataset forms.
 *
 * @module
 */
import {
  DatasetSuggestionBanner,
  SheetDatasetCard,
  SingleSheetDatasetForm,
} from "@/app/[locale]/(frontend)/ingest/_components/steps/dataset-selection-sections";
import type { ConfigSuggestion, SheetInfo, SheetMapping } from "@/lib/ingest/types/wizard";

import { fireEvent, renderWithProviders, screen } from "../../setup/unit/react-render";

const suggestion = { datasetId: 7, datasetName: "Events 2025", catalogId: 3, score: 82 } as ConfigSuggestion;
const sheet: SheetInfo = { index: 0, name: "Sheet1", rowCount: 12, headers: ["a"], sampleData: [] };
const newMapping: SheetMapping = { sheetIndex: 0, datasetId: "new", newDatasetName: "Concerts", similarityScore: null };

const renderBanner = (state: { applied: boolean; dismissed: boolean }) => {
  const handlers = { onApply: vi.fn(), onIgnore: vi.fn(), onReset: vi.fn() };
  renderWithProviders(<DatasetSuggestionBanner suggestion={suggestion} {...state} {...handlers} />);
  return handlers;
};

describe("DatasetSuggestionBanner", () => {
  it("offers to reuse the suggested settings until the user decides", () => {
    const handlers = renderBanner({ applied: false, dismissed: false });

    expect(screen.getByText('Similar to "Events 2025" (82% match)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reuse import settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    expect(handlers.onApply).toHaveBeenCalledOnce();
    expect(handlers.onIgnore).toHaveBeenCalledOnce();
  });

  it("confirms the applied suggestion and offers a reset", () => {
    const handlers = renderBanner({ applied: true, dismissed: false });

    expect(screen.getByText('Import settings reused from "Events 2025"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset to auto-detected" }));
    expect(handlers.onReset).toHaveBeenCalledOnce();
  });

  it("renders nothing once dismissed", () => {
    renderBanner({ applied: false, dismissed: true });

    expect(screen.queryByTestId("dataset-suggestion-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dataset-suggestion-applied")).not.toBeInTheDocument();
  });
});

describe("SheetDatasetCard", () => {
  const renderCard = (mapping: SheetMapping) =>
    renderWithProviders(
      <SheetDatasetCard
        sheet={sheet}
        mapping={mapping}
        datasets={[{ id: 7, name: "Events 2025" }]}
        disabled={false}
        onDatasetChange={vi.fn()}
        onNameChange={vi.fn()}
      />
    );

  it("asks for a name only when the sheet creates a new dataset", () => {
    renderCard(newMapping);
    expect(screen.getByLabelText("Dataset name")).toHaveValue("Concerts");
  });

  it("shows the schema similarity of an existing dataset target", () => {
    renderCard({ ...newMapping, datasetId: 7, similarityScore: 0.914 });

    expect(screen.queryByLabelText("Dataset name")).not.toBeInTheDocument();
    expect(screen.getByText("91% match")).toBeInTheDocument();
  });
});

describe("SingleSheetDatasetForm", () => {
  it("reports name edits for sheet 0", () => {
    const onNameChange = vi.fn();
    renderWithProviders(
      <SingleSheetDatasetForm
        sheet={sheet}
        mapping={newMapping}
        siblingDatasets={[]}
        disabled={false}
        onNameChange={onNameChange}
        onCopyConfigFrom={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: "Gigs" } });
    expect(onNameChange).toHaveBeenCalledWith(0, "Gigs");
  });

  it("hides the copy-config control when the sheet targets an existing dataset", () => {
    renderWithProviders(
      <SingleSheetDatasetForm
        sheet={sheet}
        mapping={{ ...newMapping, datasetId: 7 }}
        siblingDatasets={[{ id: 7, name: "Events 2025" }]}
        disabled={false}
        onNameChange={vi.fn()}
        onCopyConfigFrom={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Reuse import settings from")).not.toBeInTheDocument();
  });
});
