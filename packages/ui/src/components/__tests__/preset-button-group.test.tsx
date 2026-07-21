/**
 * Tests for the PresetButtonGroup component.
 *
 * Verifies that the selected option is exposed to assistive technology
 * through ARIA state rather than colour alone.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PresetButtonGroup } from "../preset-button-group";

type Density = "fine" | "balanced" | "coarse";

const options = [
  { key: "fine", label: "Fine" },
  { key: "balanced", label: "Balanced" },
  { key: "coarse", label: "Coarse" },
] satisfies Array<{ key: Density; label: string }>;

describe("PresetButtonGroup - accessibility", () => {
  it("marks the selected option as pressed and the others as not pressed", () => {
    render(<PresetButtonGroup options={options} value="balanced" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Balanced", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fine", pressed: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coarse", pressed: false })).toBeInTheDocument();
  });

  it("moves the pressed state when the selected value changes", () => {
    const { rerender } = render(<PresetButtonGroup options={options} value="fine" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Fine" })).toHaveAttribute("aria-pressed", "true");

    rerender(<PresetButtonGroup options={options} value="coarse" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Fine" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Coarse" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks nothing as pressed when the value matches no option", () => {
    render(<PresetButtonGroup options={options} value="unknown" onChange={vi.fn()} />);

    for (const option of options) {
      expect(screen.getByRole("button", { name: option.label })).toHaveAttribute("aria-pressed", "false");
    }
  });
});

describe("PresetButtonGroup - behaviour", () => {
  it("calls onChange with the option key when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PresetButtonGroup options={options} value="fine" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Coarse" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("coarse");
  });
});
