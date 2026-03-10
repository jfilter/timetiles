/**
 * Tests for the import wizard upload step components.
 *
 * @module
 */
import { FileDropZone } from "@/app/(frontend)/import/_components/steps/step-upload-file-drop";
import { UploadPreview } from "@/app/(frontend)/import/_components/steps/step-upload-preview";
import { UrlInputForm } from "@/app/(frontend)/import/_components/steps/step-upload-url-input";

import { fireEvent, renderWithProviders, screen } from "../../setup/unit/react-render";

// ---------------------------------------------------------------------------
// FileDropZone
// ---------------------------------------------------------------------------
describe("FileDropZone", () => {
  const defaultProps = {
    isDragging: false,
    isUploading: false,
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onFileSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders upload prompt in default state", () => {
    renderWithProviders(<FileDropZone {...defaultProps} />);

    expect(screen.getByText("Drag and drop your file here")).toBeInTheDocument();
    expect(screen.getByText("Browse files")).toBeInTheDocument();
    expect(screen.getByText("Supported formats: CSV, XLS, XLSX, ODS")).toBeInTheDocument();
  });

  test("shows loading spinner when uploading", () => {
    renderWithProviders(<FileDropZone {...defaultProps} isUploading />);

    expect(screen.getByText("Processing file...")).toBeInTheDocument();
  });

  test("applies drag-over styling when dragging", () => {
    const { container } = renderWithProviders(<FileDropZone {...defaultProps} isDragging />);

    // The border-primary class is applied via cn() when isDragging is true
    expect(container.innerHTML).toContain("border-primary");
  });

  test("accepts correct file types", () => {
    renderWithProviders(<FileDropZone {...defaultProps} />);

    const input = document.querySelector('input[type="file"]')!;
    const accept = input.getAttribute("accept") ?? "";
    expect(accept).toContain(".csv");
    expect(accept).toContain(".xlsx");
    expect(accept).toContain(".xls");
    expect(accept).toContain(".ods");
  });

  test("applies disabled styling when uploading", () => {
    const { container } = renderWithProviders(<FileDropZone {...defaultProps} isUploading />);

    expect(container.innerHTML).toContain("pointer-events-none");
    expect(container.innerHTML).toContain("opacity-50");
  });
});

// ---------------------------------------------------------------------------
// UrlInputForm
// ---------------------------------------------------------------------------
describe("UrlInputForm", () => {
  const defaultProps = { initialUrl: "", isLoading: false, onFetch: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders URL input field", () => {
    renderWithProviders(<UrlInputForm {...defaultProps} />);

    expect(screen.getByPlaceholderText("https://example.com/data.csv")).toBeInTheDocument();
    expect(screen.getByText(/Enter a URL that returns CSV/)).toBeInTheDocument();
  });

  test("pre-fills URL from initialUrl prop", () => {
    const { container } = renderWithProviders(
      <UrlInputForm {...defaultProps} initialUrl="https://prefilled.com/data.csv" />
    );

    const input = container.querySelector<HTMLInputElement>('input[type="url"]');
    expect(input).toHaveValue("https://prefilled.com/data.csv");
  });

  test("disables input when loading", () => {
    const { container } = renderWithProviders(
      <UrlInputForm {...defaultProps} initialUrl="https://example.com" isLoading />
    );

    const input = container.querySelector<HTMLInputElement>('input[type="url"]');
    expect(input).toBeDisabled();
  });

  test("calls onFetch with URL and null auth when fetch is triggered", () => {
    const onFetch = vi.fn();
    const { container } = renderWithProviders(<UrlInputForm {...defaultProps} onFetch={onFetch} />);

    const input = container.querySelector<HTMLInputElement>('input[type="url"]')!;
    fireEvent.change(input, { target: { value: "https://example.com/data.csv" } });

    // Find the Fetch button via container query
    const fetchButton = container.querySelector<HTMLButtonElement>("button:not([aria-label])")!;
    fireEvent.click(fetchButton);

    expect(onFetch).toHaveBeenCalledWith("https://example.com/data.csv", null);
  });

  test("renders authentication settings toggle", () => {
    const { container } = renderWithProviders(<UrlInputForm {...defaultProps} />);

    expect(container.textContent).toContain("Authentication settings");
  });
});

// ---------------------------------------------------------------------------
// UploadPreview
// ---------------------------------------------------------------------------
describe("UploadPreview", () => {
  const defaultFile = { name: "events.csv", size: 1024 * 50, mimeType: "text/csv" };
  const defaultSheets = [{ index: 0, name: "Sheet1", rowCount: 150, headers: [], sampleData: [] }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders file info for uploaded file", () => {
    renderWithProviders(<UploadPreview file={defaultFile} sheets={defaultSheets} onRemove={vi.fn()} />);

    expect(screen.getByText("events.csv")).toBeInTheDocument();
    expect(screen.getByText("50.0 KB")).toBeInTheDocument();
    expect(screen.getByText("150 rows")).toBeInTheDocument();
    expect(screen.getByText("File ready for import")).toBeInTheDocument();
  });

  test("renders URL info when sourceUrl is provided", () => {
    renderWithProviders(
      <UploadPreview
        file={defaultFile}
        sheets={defaultSheets}
        sourceUrl="https://example.com/data.csv"
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText("URL data ready for import")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/data.csv")).toBeInTheDocument();
  });

  test("shows sheet count for multi-sheet files", () => {
    const sheets = [
      { index: 0, name: "Events", rowCount: 100, headers: [], sampleData: [] },
      { index: 1, name: "Locations", rowCount: 50, headers: [], sampleData: [] },
      { index: 2, name: "Categories", rowCount: 25, headers: [], sampleData: [] },
    ];

    renderWithProviders(<UploadPreview file={defaultFile} sheets={sheets} onRemove={vi.fn()} />);

    expect(screen.getByText("3 sheets")).toBeInTheDocument();
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Locations")).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
  });

  test("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    const { container } = renderWithProviders(
      <UploadPreview file={defaultFile} sheets={defaultSheets} onRemove={onRemove} />
    );

    const removeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Remove file"]')!;
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledOnce();
  });

  test("formats large file sizes correctly", () => {
    const largeFile = { name: "big.xlsx", size: 1024 * 1024 * 2.5, mimeType: "application/vnd.ms-excel" };
    renderWithProviders(<UploadPreview file={largeFile} sheets={defaultSheets} onRemove={vi.fn()} />);

    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
  });

  test("hides file size when size is 0", () => {
    const noSizeFile = { name: "stream.csv", size: 0, mimeType: "text/csv" };
    const { container } = renderWithProviders(
      <UploadPreview file={noSizeFile} sheets={defaultSheets} onRemove={vi.fn()} />
    );

    expect(container.textContent).not.toContain("0 B");
    expect(container.textContent).toContain("150 rows");
  });

  test("formats small file sizes in bytes", () => {
    const tinyFile = { name: "tiny.csv", size: 512, mimeType: "text/csv" };
    renderWithProviders(<UploadPreview file={tinyFile} sheets={defaultSheets} onRemove={vi.fn()} />);

    expect(screen.getByText("512 B")).toBeInTheDocument();
  });
});
