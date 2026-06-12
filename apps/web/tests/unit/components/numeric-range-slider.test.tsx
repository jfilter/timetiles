/**
 * Unit tests for the NumericRangeSlider component.
 *
 * Tests dual-handle rendering (WAI-ARIA sliders), keyboard interaction, edit-mode
 * numeric inputs, and the domain-edge → null collapse so an unconstrained side
 * never narrows the query.
 *
 * Queries are scoped to each render's own `container` so the tests are immune to
 * DOM left over from sibling tests.
 *
 * @module
 */
import { NumericRangeSlider } from "@/components/filters/numeric-range-slider";

import { fireEvent, renderWithProviders, within } from "../../setup/unit/react-render";

describe("NumericRangeSlider", () => {
  const noop = () => undefined;

  it("renders two slider handles with the domain min/max", () => {
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: null, max: null }}
        onChange={noop}
      />
    );

    const sliders = within(container).getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    // With null bounds the handles sit at the domain edges.
    expect(sliders[0]).toHaveAttribute("aria-valuenow", "0");
    expect(sliders[1]).toHaveAttribute("aria-valuenow", "100");
    expect(sliders[0]).toHaveAttribute("aria-valuemin", "0");
    expect(sliders[1]).toHaveAttribute("aria-valuemax", "100");
  });

  it("reflects the active bounds on the handles", () => {
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: 20, max: 80 }}
        onChange={noop}
      />
    );

    const sliders = within(container).getAllByRole("slider");
    expect(sliders[0]).toHaveAttribute("aria-valuenow", "20");
    expect(sliders[1]).toHaveAttribute("aria-valuenow", "80");
  });

  it("collapses a max bound at the domain edge to null on keyboard increase", () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider label="Count" min={0} max={10} isInteger value={{ min: 3, max: 9 }} onChange={onChange} />
    );

    const maxHandle = within(container).getAllByRole("slider")[1]!;
    // ArrowRight on an integer slider bumps by 1: 9 → 10 (== domain max → null).
    fireEvent.keyDown(maxHandle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(3, null);
  });

  it("decreases the min bound by one step on keyboard ArrowLeft (integer)", () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider label="Count" min={0} max={10} isInteger value={{ min: 5, max: 9 }} onChange={onChange} />
    );

    const minHandle = within(container).getAllByRole("slider")[0]!;
    fireEvent.keyDown(minHandle, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(4, 9);
  });

  it("edits the min bound via the numeric input", () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: null, max: null }}
        onChange={onChange}
      />
    );

    // Open edit mode (the summary button toggles inputs).
    fireEvent.click(within(container).getByRole("button", { name: "0 → 100" }));
    // Two spinbuttons (min, max); the first is the min input.
    const minInput = within(container).getAllByRole("spinbutton")[0]!;
    fireEvent.change(minInput, { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledWith(25, null);
  });

  it("clamps a typed min above the current max instead of inverting the range", () => {
    // Regression: committing min > max sent an inverted range that failed the
    // server-side Zod refine — every events/stats/chart request 422ed until
    // the user fixed the digits.
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: null, max: 50 }}
        onChange={onChange}
      />
    );

    fireEvent.click(within(container).getByRole("button", { name: "0 → 50" }));
    const minInput = within(container).getAllByRole("spinbutton")[0]!;
    fireEvent.change(minInput, { target: { value: "60" } });
    expect(onChange).toHaveBeenCalledWith(50, 50);
  });

  it("clamps a typed max below the current min instead of inverting the range", () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: 40, max: null }}
        onChange={onChange}
      />
    );

    fireEvent.click(within(container).getByRole("button", { name: "40 → 100" }));
    const maxInput = within(container).getAllByRole("spinbutton")[1]!;
    fireEvent.change(maxInput, { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith(40, 40);
  });

  it("collapses a typed min at the domain edge to null (open end)", () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: 50, max: null }}
        onChange={onChange}
      />
    );

    fireEvent.click(within(container).getByRole("button", { name: "50 → 100" }));
    const minInput = within(container).getAllByRole("spinbutton")[0]!;
    // Typing the domain minimum collapses to null, matching the drag/keyboard paths.
    fireEvent.change(minInput, { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it("collapses a typed max at the domain edge to null (open end)", () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: 10, max: 50 }}
        onChange={onChange}
      />
    );

    fireEvent.click(within(container).getByRole("button", { name: "10 → 50" }));
    const maxInput = within(container).getAllByRole("spinbutton")[1]!;
    fireEvent.change(maxInput, { target: { value: "100" } });
    expect(onChange).toHaveBeenCalledWith(10, null);
  });

  it("clears a bound to null when its input is emptied", () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <NumericRangeSlider
        label="Price"
        min={0}
        max={100}
        isInteger={false}
        value={{ min: 25, max: null }}
        onChange={onChange}
      />
    );

    fireEvent.click(within(container).getByRole("button", { name: "25 → 100" }));
    const minInput = within(container).getAllByRole("spinbutton")[0]!;
    fireEvent.change(minInput, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null, null);
  });
});
