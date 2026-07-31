/**
 * The date filter input's commit rule, which has now been wrong in both directions.
 *
 * Committing on every change pushed `null` while the year was still being typed, because
 * `<input type="date">` reports "" for any incomplete entry. Committing only on blur then
 * broke the opposite case: the native calendar popup emits a complete date without moving
 * focus, so picking a date visibly did nothing until the user clicked elsewhere.
 *
 * @module
 * @category Unit Tests
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DateInput } from "@/components/filters/time-range-slider";

const renderInput = (value = "2024-06-15") => {
  const onCommit = vi.fn();
  render(<DateInput value={value} onCommit={onCommit} min="2020-01-01" max="2030-12-31" label="Start date" />);
  return { onCommit, input: screen.getByLabelText<HTMLInputElement>("Start date") };
};

describe.sequential("DateInput", () => {
  it("commits a complete date immediately, without waiting for blur", () => {
    const { onCommit, input } = renderInput();

    fireEvent.change(input, { target: { value: "2024-07-04" } });

    expect(onCommit).toHaveBeenCalledWith("2024-07-04");
  });

  it("does not commit an incomplete entry", () => {
    const { onCommit, input } = renderInput();

    // Every partially-entered date arrives as "" from the browser.
    fireEvent.change(input, { target: { value: "" } });

    expect(onCommit).not.toHaveBeenCalled();
    // The field must show the draft, not snap back to the committed value.
    expect(input.value).toBe("");
  });

  it("commits the cleared field on blur, which is how the filter is removed", () => {
    const { onCommit, input } = renderInput();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("discards a draft on Escape", () => {
    const { onCommit, input } = renderInput();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("2024-06-15");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("shows the committed value again when the filter changes underneath it", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <DateInput value="2024-06-15" onCommit={onCommit} min="2020-01-01" max="2030-12-31" label="Start date" />
    );
    const input = screen.getByLabelText<HTMLInputElement>("Start date");

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    // e.g. the back button or a reset writing the URL params
    rerender(<DateInput value="2023-01-01" onCommit={onCommit} min="2020-01-01" max="2030-12-31" label="Start date" />);

    expect(input.value).toBe("2023-01-01");
  });
});
