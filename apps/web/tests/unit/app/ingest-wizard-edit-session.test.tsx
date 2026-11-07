/**
 * Edit-session lifecycle of the import wizard: entering, leaving and failing to load `?edit=`.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledIngest } from "@/payload-types";

const mocks = vi.hoisted(() => ({
  schedule: { data: undefined as ScheduledIngest | undefined, isLoading: false, isError: false },
}));

vi.mock("@/lib/hooks/use-scheduled-ingest-query", () => ({ useScheduledIngestQuery: () => mocks.schedule }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/app/[locale]/(frontend)/(app)/ingest/_components/steps", () => ({
  StepAuth: () => <p>auth step</p>,
  StepUpload: () => <p>upload step</p>,
  StepDatasetSelection: () => <p>dataset step</p>,
  StepFieldMapping: () => <p>mapping step</p>,
  StepSchedule: () => <p>schedule step</p>,
  StepReview: () => <p>review step</p>,
  StepProcessing: () => <p>processing step</p>,
}));

import { IngestWizard } from "@/app/[locale]/(frontend)/(app)/ingest/_components/ingest-wizard";
import { initialState } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-state";
import { useWizardStore } from "@/app/[locale]/(frontend)/(app)/ingest/_components/wizard-store";

import { renderWithProviders, screen } from "../../setup/unit/react-render";

const schedule: ScheduledIngest = {
  id: 5,
  name: "Weekly feed",
  createdBy: 1,
  sourceUrl: "https://example.com/feed.csv",
  catalog: 3,
  scheduleType: "frequency",
  frequency: "weekly",
  schemaMode: "additive",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("IngestWizard edit session", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    mocks.schedule = { data: undefined, isLoading: false, isError: false };
    useWizardStore.setState({ ...initialState, _initialized: true, startedAuthenticated: true, currentStep: 2 });
  });

  afterEach(() => {
    useWizardStore.setState({ ...initialState, _initialized: false, _savedAt: 0 });
    localStorage.clear();
  });

  it("starts a new import when an edit session is left behind without ?edit=", async () => {
    useWizardStore
      .getState()
      .initializeForEdit(5, {
        sourceUrl: schedule.sourceUrl,
        authConfig: null,
        jsonApiConfig: null,
        selectedCatalogId: 3,
        scheduleConfig: {
          enabled: true,
          name: schedule.name,
          scheduleType: "frequency",
          frequency: "weekly",
          cronExpression: "",
          schemaMode: "additive",
        },
        datasetId: null,
        datasetConfig: null,
      });

    renderWithProviders(<IngestWizard editScheduleId={null} />);

    expect(await screen.findByText("upload step")).toBeInTheDocument();
    expect(useWizardStore.getState()).toMatchObject({
      editMode: false,
      editScheduleId: null,
      sourceUrl: null,
      selectedCatalogId: null,
    });
  });

  it("enters edit mode for a loadable schedule", async () => {
    mocks.schedule = { data: schedule, isLoading: false, isError: false };

    renderWithProviders(<IngestWizard editScheduleId={5} />);

    expect(await screen.findByText("upload step")).toBeInTheDocument();
    expect(useWizardStore.getState()).toMatchObject({ editMode: true, editScheduleId: 5 });
  });

  it("shows an error instead of loading forever when the schedule cannot be edited", async () => {
    mocks.schedule = {
      data: { ...schedule, catalog: null as unknown as ScheduledIngest["catalog"] },
      isLoading: false,
      isError: false,
    };

    renderWithProviders(<IngestWizard editScheduleId={5} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("catalog no longer exists");
    expect(screen.queryByText("Loading schedule...")).not.toBeInTheDocument();
    expect(useWizardStore.getState().editMode).toBe(false);
  });
});
