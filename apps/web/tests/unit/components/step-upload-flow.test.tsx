/**
 * Integration-style unit tests for the StepUpload component.
 *
 * Tests the full upload flow (file + URL) with mocked fetch()
 * and mocked wizard context. Tests run sequentially because they
 * share mutable state (fetch mock, wizard state).
 *
 * @module
 */
/* eslint-disable @typescript-eslint/require-await -- act(async () => ...) is the standard React 19 pattern for flushing state updates */
import { StepUpload } from "@/app/[locale]/(frontend)/import/_components/steps/step-upload";
import type { WizardState } from "@/app/[locale]/(frontend)/import/_components/wizard-context";

import { act, fireEvent, renderWithProviders, screen, waitFor } from "../../setup/unit/react-render";

// ---------------------------------------------------------------------------
// Mock wizard context
// ---------------------------------------------------------------------------
const mockSetFile = vi.fn();
const mockSetSourceUrl = vi.fn();
const mockClearFile = vi.fn();
const mockNextStep = vi.fn();

const baseWizardState: WizardState = {
  currentStep: 2,
  startedAuthenticated: true,
  previewId: null,
  file: null,
  sheets: [],
  sourceUrl: null,
  authConfig: null,
  selectedCatalogId: null,
  newCatalogName: "",
  sheetMappings: [],
  fieldMappings: [],
  transforms: {},
  deduplicationStrategy: "skip",
  geocodingEnabled: true,
  scheduleConfig: null,
  configSuggestions: [],
  importFileId: null,
  scheduledImportId: null,
  error: null,
};

let wizardState = { ...baseWizardState };

vi.mock("@/app/[locale]/(frontend)/import/_components/wizard-context", () => ({
  useWizard: () => ({
    state: wizardState,
    setFile: mockSetFile,
    setSourceUrl: mockSetSourceUrl,
    clearFile: mockClearFile,
    nextStep: mockNextStep,
  }),
}));

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------
let fetchMock: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

// eslint-disable promise/prefer-await-to-then -- Mock response factory
const jsonResponse = (data: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(data) } as Response);
// eslint-enable promise/prefer-await-to-then

const apiSuccess = {
  sheets: [{ index: 0, name: "Sheet1", rowCount: 42, headers: ["col1", "col2"], sampleData: [] }],
  previewId: "preview-abc123",
};

const urlApiSuccess = { ...apiSuccess, fileName: "remote-data.csv", contentLength: 2048, contentType: "text/csv" };

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  wizardState = { ...baseWizardState };
  fetchMock = vi.fn<typeof globalThis.fetch>(() => jsonResponse(apiSuccess));
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const createFile = (name = "events.csv", type = "text/csv") => new File(["col1,col2\nval1,val2"], name, { type });

/** Find the Fetch button */
const findFetchButton = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === "Fetch");

// ---------------------------------------------------------------------------
// All tests run sequentially (shared mutable state: fetch mock, wizard state)
// ---------------------------------------------------------------------------
describe.sequential("StepUpload", () => {
  // -------------------------------------------------------------------------
  // File Upload Flow
  // -------------------------------------------------------------------------
  describe("file upload flow", () => {
    test("uploads file via file input and calls setFile on success", async () => {
      const { container } = renderWithProviders(<StepUpload />);

      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      expect(input).toBeTruthy();

      await act(async () => {
        fireEvent.change(input, { target: { files: [createFile()] } });
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/import/preview-schema/upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await waitFor(() => {
        expect(mockSetFile).toHaveBeenCalledWith(
          { name: "events.csv", size: expect.any(Number), mimeType: "text/csv" },
          apiSuccess.sheets,
          "preview-abc123",
          undefined,
          undefined
        );
      });
    });

    test("sends FormData with the file to preview-schema API", async () => {
      const { container } = renderWithProviders(<StepUpload />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

      await act(async () => {
        fireEvent.change(input, { target: { files: [createFile("data.xlsx", "application/vnd.ms-excel")] } });
      });

      await waitFor(() => {
        const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/import/preview-schema/upload");
        expect(options.method).toBe("POST");
        expect(options.body).toBeInstanceOf(FormData);
        expect((options.body as FormData).get("file")).toBeInstanceOf(File);
      });
    });

    test("shows error when file upload API returns error", async () => {
      fetchMock.mockImplementation(() => jsonResponse({ error: "File too large" }, false));

      const { container } = renderWithProviders(<StepUpload />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

      await act(async () => {
        fireEvent.change(input, { target: { files: [createFile()] } });
      });

      await waitFor(() => {
        expect(screen.getByText("File too large")).toBeInTheDocument();
      });
      expect(mockSetFile).not.toHaveBeenCalled();
    });

    test("shows error when fetch throws a network error", async () => {
      fetchMock.mockRejectedValue(new Error("Network failure"));

      const { container } = renderWithProviders(<StepUpload />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

      await act(async () => {
        fireEvent.change(input, { target: { files: [createFile()] } });
      });

      await waitFor(() => {
        expect(screen.getByText("Network failure")).toBeInTheDocument();
      });
    });

    test("uploads file via drag-and-drop", async () => {
      renderWithProviders(<StepUpload />);

      const dropText = screen.getByText("Drag and drop your file here");
      const dropZone = dropText.closest("div")!;

      await act(async () => {
        fireEvent.drop(dropZone, { dataTransfer: { files: [createFile()] } });
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/import/preview-schema/upload",
          expect.objectContaining({ method: "POST" })
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // URL Fetch Flow
  // -------------------------------------------------------------------------
  // To activate the URL tab, we set sourceUrl in wizard state so the
  // component initializes with inputMode="url" (avoids Radix Tab
  // switching issues in jsdom).
  describe("URL fetch flow", () => {
    /** Activate URL tab by setting a sourceUrl (component reads inputMode from it) */
    const activateUrlTab = () => {
      wizardState = { ...baseWizardState, sourceUrl: "https://placeholder.test" };
    };

    test("user types URL, clicks Fetch — calls setSourceUrl + setFile", async () => {
      activateUrlTab();
      fetchMock.mockImplementation(() => jsonResponse(urlApiSuccess));

      const { container } = renderWithProviders(<StepUpload />);
      const urlInput = container.querySelector<HTMLInputElement>('input[type="url"]')!;
      expect(urlInput).toBeTruthy();

      // User clears pre-filled URL and types a new one
      fireEvent.change(urlInput, { target: { value: "https://example.com/data.csv" } });

      await act(async () => {
        fireEvent.click(findFetchButton()!);
      });

      // Verify the user-typed URL was sent (not the pre-filled one)
      await waitFor(() => {
        const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string);
        expect(body.sourceUrl).toBe("https://example.com/data.csv");
      });

      await waitFor(() => {
        expect(mockSetSourceUrl).toHaveBeenCalledWith("https://example.com/data.csv", null);
        expect(mockSetFile).toHaveBeenCalledWith(
          { name: "remote-data.csv", size: 2048, mimeType: "text/csv" },
          urlApiSuccess.sheets,
          "preview-abc123",
          "https://example.com/data.csv",
          undefined
        );
      });
    });

    test("shows error when URL fetch API fails", async () => {
      activateUrlTab();
      fetchMock.mockImplementation(() => jsonResponse({ error: "URL not reachable" }, false));

      const { container } = renderWithProviders(<StepUpload />);
      const urlInput = container.querySelector<HTMLInputElement>('input[type="url"]')!;

      fireEvent.change(urlInput, { target: { value: "https://unreachable.example.com" } });

      await act(async () => {
        fireEvent.click(findFetchButton()!);
      });

      await waitFor(() => {
        expect(screen.getByText("URL not reachable")).toBeInTheDocument();
      });
      expect(mockSetFile).not.toHaveBeenCalled();
    });

    test("sends no auth payload when auth type is none", async () => {
      activateUrlTab();
      fetchMock.mockImplementation(() => jsonResponse(urlApiSuccess));

      const { container } = renderWithProviders(<StepUpload />);
      const urlInput = container.querySelector<HTMLInputElement>('input[type="url"]')!;

      fireEvent.change(urlInput, { target: { value: "https://api.example.com/data" } });

      await act(async () => {
        fireEvent.click(findFetchButton()!);
      });

      await waitFor(() => {
        const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string);
        expect(body.authConfig).toBeUndefined();
        expect(body.sourceUrl).toBe("https://api.example.com/data");
      });
    });

    test("disables Fetch button when URL input is empty", () => {
      activateUrlTab();

      const { container } = renderWithProviders(<StepUpload />);
      const urlInput = container.querySelector<HTMLInputElement>('input[type="url"]')!;

      // Clear the pre-filled URL
      fireEvent.change(urlInput, { target: { value: "" } });

      const fetchButton = findFetchButton();
      expect(fetchButton).toBeTruthy();
      expect(fetchButton!).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Preview State (when file is already loaded)
  // -------------------------------------------------------------------------
  describe("preview state", () => {
    test("shows file preview when wizard state has a file", () => {
      wizardState = {
        ...baseWizardState,
        file: { name: "events.csv", size: 51200, mimeType: "text/csv" },
        sheets: [{ index: 0, name: "Sheet1", rowCount: 150, headers: [], sampleData: [] }],
      };

      const { container } = renderWithProviders(<StepUpload />);

      expect(container.textContent).toContain("events.csv");
      expect(container.textContent).toContain("File ready for import");
      expect(container.textContent).toContain("150 rows");
    });

    test("shows URL preview when sourceUrl is set", () => {
      wizardState = {
        ...baseWizardState,
        file: { name: "remote.csv", size: 2048, mimeType: "text/csv" },
        sheets: [{ index: 0, name: "Sheet1", rowCount: 75, headers: [], sampleData: [] }],
        sourceUrl: "https://example.com/remote.csv",
      };

      const { container } = renderWithProviders(<StepUpload />);

      expect(container.textContent).toContain("URL data ready for import");
      expect(container.textContent).toContain("https://example.com/remote.csv");
    });

    test("calls clearFile when remove button is clicked", () => {
      wizardState = {
        ...baseWizardState,
        file: { name: "events.csv", size: 1024, mimeType: "text/csv" },
        sheets: [{ index: 0, name: "Sheet1", rowCount: 10, headers: [], sampleData: [] }],
      };

      const { container } = renderWithProviders(<StepUpload />);

      const removeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Remove file"]')!;
      expect(removeButton).toBeTruthy();
      fireEvent.click(removeButton);

      expect(mockClearFile).toHaveBeenCalledOnce();
    });

    test("hides upload tabs when file is loaded", () => {
      wizardState = {
        ...baseWizardState,
        file: { name: "events.csv", size: 1024, mimeType: "text/csv" },
        sheets: [{ index: 0, name: "Sheet1", rowCount: 10, headers: [], sampleData: [] }],
      };

      renderWithProviders(<StepUpload />);

      const tabs = document.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(0);
    });
  });
});
