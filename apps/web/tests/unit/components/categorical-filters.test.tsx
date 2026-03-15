/**
 * Unit tests for the CategoricalFilters component.
 *
 * Tests rendering of enum field dropdowns, loading skeleton,
 * and edge cases with empty data.
 *
 * @module
 */
import { CategoricalFilters } from "@/components/filters/categorical-filters";
import type { EnumField } from "@/lib/hooks/use-dataset-enum-fields";

import { renderWithProviders, screen } from "../../setup/unit/react-render";

// Mock the useFilters hook
const mockSetFieldFilter = vi.fn();
vi.mock("@/lib/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} },
    setFieldFilter: mockSetFieldFilter,
  }),
}));

// Mock the EnumFieldDropdown component to simplify assertions
vi.mock("@/components/filters/enum-field-dropdown", () => ({
  EnumFieldDropdown: ({
    label,
    values,
    selectedValues,
  }: {
    label: string;
    values: Array<{ value: string; count: number; percent: number }>;
    selectedValues: string[];
    onSelectionChange: (values: string[]) => void;
  }) => (
    <div data-testid={`enum-dropdown-${label}`}>
      <span data-testid="dropdown-label">{label}</span>
      <span data-testid="dropdown-values-count">{values.length} values</span>
      <span data-testid="dropdown-selected-count">{selectedValues.length} selected</span>
    </div>
  ),
}));

/** Helper to create a test enum field */
const createEnumField = (path: string, label: string, valueCount: number): EnumField => ({
  path,
  label,
  values: Array.from({ length: valueCount }, (_, i) => ({
    value: `value-${i + 1}`,
    count: 100 - i * 10,
    percent: 100 - i * 10,
  })),
  cardinality: valueCount,
});

describe("CategoricalFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering enum field dropdowns", () => {
    it("renders a dropdown for each enum field", () => {
      const enumFields = [
        createEnumField("status", "Status", 3),
        createEnumField("category", "Category", 5),
        createEnumField("priority", "Priority", 2),
      ];

      renderWithProviders(<CategoricalFilters enumFields={enumFields} isLoading={false} />);

      expect(screen.getByTestId("enum-dropdown-Status")).toBeInTheDocument();
      expect(screen.getByTestId("enum-dropdown-Category")).toBeInTheDocument();
      expect(screen.getByTestId("enum-dropdown-Priority")).toBeInTheDocument();
    });

    it("passes correct values count to each dropdown", () => {
      const enumFields = [createEnumField("status", "Status", 3), createEnumField("category", "Category", 7)];

      const { container } = renderWithProviders(<CategoricalFilters enumFields={enumFields} isLoading={false} />);

      const statusDropdown = container.querySelector('[data-testid="enum-dropdown-Status"]');
      expect(statusDropdown).toHaveTextContent("3 values");

      const categoryDropdown = container.querySelector('[data-testid="enum-dropdown-Category"]');
      expect(categoryDropdown).toHaveTextContent("7 values");
    });
  });

  describe("Loading state", () => {
    it("shows loading skeleton when isLoading is true", () => {
      renderWithProviders(<CategoricalFilters enumFields={[]} isLoading />);

      const skeleton = screen.getByRole("status", { name: "Loading filters" });
      expect(skeleton).toBeInTheDocument();

      // Should render animated pulse placeholders
      const pulseElements = skeleton.querySelectorAll(".animate-pulse");
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it("does not render dropdowns when loading", () => {
      const enumFields = [createEnumField("status", "Status", 3)];

      const { container } = renderWithProviders(<CategoricalFilters enumFields={enumFields} isLoading />);

      expect(container.querySelector('[data-testid="enum-dropdown-Status"]')).toBeNull();
    });
  });

  describe("Empty state", () => {
    it("renders nothing when enumFields array is empty", () => {
      const { container } = renderWithProviders(<CategoricalFilters enumFields={[]} isLoading={false} />);

      // Component returns null for empty fields - no dropdown elements rendered
      expect(container.querySelector('[data-testid^="enum-dropdown-"]')).toBeNull();
      expect(container.querySelector(".space-y-3")).toBeNull();
    });
  });

  describe("Fields with no values", () => {
    it("renders dropdowns even when fields have zero values", () => {
      const enumFields = [createEnumField("empty_field", "Empty Field", 0)];

      renderWithProviders(<CategoricalFilters enumFields={enumFields} isLoading={false} />);

      const dropdown = screen.getByTestId("enum-dropdown-Empty Field");
      expect(dropdown).toBeInTheDocument();
      expect(dropdown).toHaveTextContent("0 values");
    });
  });
});
