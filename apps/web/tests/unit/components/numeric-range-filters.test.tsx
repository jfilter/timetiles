/**
 * Unit tests for the NumericRangeFilters component.
 *
 * Tests rendering of numeric range sliders, the loading skeleton, empty state,
 * show-more expansion, and wiring of slider onChange to setRangeFilter.
 *
 * @module
 */
import { NumericRangeFilters } from "@/components/filters/numeric-range-filters";
import type { NumericField } from "@/lib/hooks/use-dataset-numeric-fields";

import { fireEvent, renderWithProviders, within } from "../../setup/unit/react-render";

// Mock the useFilters hook — capture setRangeFilter calls and supply rangeFilters.
const mockSetRangeFilter = vi.fn();
const mockRangeFilters: Record<string, { min: number | null; max: number | null }> = {};
vi.mock("@/lib/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: { datasets: [], startDate: null, endDate: null, fieldFilters: {}, rangeFilters: mockRangeFilters },
    setRangeFilter: mockSetRangeFilter,
  }),
}));

// Mock the NumericRangeSlider child to simplify assertions and expose onChange.
vi.mock("@/components/filters/numeric-range-slider", () => ({
  NumericRangeSlider: ({
    label,
    min,
    max,
    isInteger,
    onChange,
  }: {
    label: string;
    min: number;
    max: number;
    isInteger: boolean;
    value: { min: number | null; max: number | null };
    onChange: (min: number | null, max: number | null) => void;
  }) => (
    <div data-testid={`range-slider-${label}`}>
      <span data-testid="slider-label">{label}</span>
      <span data-testid="slider-bounds">{`${min}-${max}`}</span>
      <span data-testid="slider-integer">{String(isInteger)}</span>
      <button type="button" onClick={() => onChange(5, 50)}>
        set-range
      </button>
    </div>
  ),
}));

/** Helper to create a test numeric field. */
const createNumericField = (
  path: string,
  label: string,
  min: number,
  max: number,
  isInteger = false
): NumericField => ({ path, label, min, max, isInteger });

describe("NumericRangeFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(mockRangeFilters)) delete mockRangeFilters[k];
  });

  describe("Rendering range sliders", () => {
    it("renders a slider for each numeric field", () => {
      const numericFields = [
        createNumericField("price", "Price", 0, 100),
        createNumericField("count", "Count", 1, 50, true),
      ];

      const { container } = renderWithProviders(
        <NumericRangeFilters numericFields={numericFields} isLoading={false} />
      );

      expect(within(container).getByTestId("range-slider-Price")).toBeInTheDocument();
      expect(within(container).getByTestId("range-slider-Count")).toBeInTheDocument();
    });

    it("passes bounds and isInteger to each slider", () => {
      const numericFields = [createNumericField("count", "Count", 1, 50, true)];

      const { container } = renderWithProviders(
        <NumericRangeFilters numericFields={numericFields} isLoading={false} />
      );

      const slider = container.querySelector('[data-testid="range-slider-Count"]');
      expect(slider).toHaveTextContent("1-50");
      expect(slider).toHaveTextContent("true");
    });

    it("wires slider onChange to setRangeFilter with the field path", () => {
      const numericFields = [createNumericField("price", "Price", 0, 100)];

      const { container } = renderWithProviders(
        <NumericRangeFilters numericFields={numericFields} isLoading={false} />
      );

      fireEvent.click(within(container).getByText("set-range"));
      expect(mockSetRangeFilter).toHaveBeenCalledWith("price", 5, 50);
    });

    it("only renders the first five fields until expanded", () => {
      const numericFields = Array.from({ length: 7 }, (_, i) => createNumericField(`f${i}`, `Field ${i}`, 0, 10));

      const { container } = renderWithProviders(
        <NumericRangeFilters numericFields={numericFields} isLoading={false} />
      );

      expect(container.querySelectorAll('[data-testid^="range-slider-"]')).toHaveLength(5);

      fireEvent.click(within(container).getByText(/more ranges/i));
      expect(container.querySelectorAll('[data-testid^="range-slider-"]')).toHaveLength(7);
    });
  });

  describe("Loading state", () => {
    it("shows loading skeleton when isLoading is true", () => {
      const { container } = renderWithProviders(<NumericRangeFilters numericFields={[]} isLoading />);

      const skeleton = within(container).getByRole("status", { name: "Loading filters" });
      expect(skeleton).toBeInTheDocument();
      expect(skeleton.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    it("does not render sliders when loading", () => {
      const numericFields = [createNumericField("price", "Price", 0, 100)];

      const { container } = renderWithProviders(<NumericRangeFilters numericFields={numericFields} isLoading />);

      expect(container.querySelector('[data-testid="range-slider-Price"]')).toBeNull();
    });
  });

  describe("Empty state", () => {
    it("renders nothing when numericFields array is empty", () => {
      const { container } = renderWithProviders(<NumericRangeFilters numericFields={[]} isLoading={false} />);

      expect(container.querySelector('[data-testid^="range-slider-"]')).toBeNull();
    });
  });
});
