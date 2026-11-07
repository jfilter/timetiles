/**
 * Catalog defaulting in the dataset-selection step for empty and failed catalog loads.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/http-error";

const mocks = vi.hoisted(() => ({
  catalogs: { data: undefined as { catalogs: unknown[] } | undefined, isLoading: false, error: null as Error | null },
}));

vi.mock("@/lib/hooks/use-catalogs-query", () => ({ useCatalogsQuery: () => mocks.catalogs }));
vi.mock("@/app/[locale]/(frontend)/(app)/ingest/_components/use-wizard-effects", () => ({
  useWizardCanProceed: () => false,
}));

import { StepDatasetSelection } from "@/app/[locale]/(frontend)/(app)/ingest/_components/steps/step-dataset-selection";
import { initialState } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-state";
import { useWizardStore } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-store";

import { renderWithProviders, screen } from "../../setup/unit/react-render";

describe("StepDatasetSelection catalog defaulting", () => {
  beforeEach(() => {
    useWizardStore.setState({
      ...initialState,
      _initialized: true,
      currentStep: 3,
      file: { name: "city-events.csv", size: 10, mimeType: "text/csv" },
    });
  });

  afterEach(() => {
    useWizardStore.setState({ ...initialState, _initialized: false, _savedAt: 0 });
    localStorage.clear();
  });

  it("defaults to a new catalog named after the file when the user has none", () => {
    mocks.catalogs = { data: { catalogs: [] }, isLoading: false, error: null };

    renderWithProviders(<StepDatasetSelection />);

    expect(useWizardStore.getState().selectedCatalogId).toBe("new");
    expect(useWizardStore.getState().newCatalogName).toBe("city events");
  });

  it("leaves the catalog unselected when loading the catalogs fails", () => {
    mocks.catalogs = { data: undefined, isLoading: false, error: new HttpError(503, "Service Unavailable") };

    renderWithProviders(<StepDatasetSelection />);

    expect(screen.getByRole("alert")).toHaveTextContent("Service Unavailable");
    expect(useWizardStore.getState().selectedCatalogId).toBeNull();
  });
});
