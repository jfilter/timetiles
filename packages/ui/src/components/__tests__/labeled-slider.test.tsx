/**
 * Tests for the LabeledSlider component.
 *
 * Verifies label/input association, value reporting, and hint labels.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LabeledSlider } from "../labeled-slider";

describe("LabeledSlider - accessibility", () => {
  it("exposes the range input with its label as accessible name", () => {
    render(<LabeledSlider label="Cluster radius" value={12} onChange={vi.fn()} min={4} max={28} />);

    const slider = screen.getByRole("slider", { name: "Cluster radius" });

    expect(slider).toHaveAttribute("type", "range");
    expect(slider).toHaveValue("12");
  });

  it("associates the label element with the input via htmlFor/id", () => {
    const { container } = render(
      <LabeledSlider label="Cluster radius" value={12} onChange={vi.fn()} min={4} max={28} />
    );

    const label = container.querySelector("label");
    const input = container.querySelector("input[type='range']");

    expect(label).not.toBeNull();
    expect(input).not.toBeNull();
    expect(input!.id).not.toBe("");
    expect(label!.getAttribute("for")).toBe(input!.id);
  });

  it("gives each instance a unique input id so labels do not cross-associate", () => {
    const { container } = render(
      <>
        <LabeledSlider label="First" value={1} onChange={vi.fn()} min={0} max={10} />
        <LabeledSlider label="Second" value={2} onChange={vi.fn()} min={0} max={10} />
      </>
    );

    const ids = Array.from(container.querySelectorAll("input[type='range']")).map((input) => input.id);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(screen.getByRole("slider", { name: "First" })).toHaveValue("1");
    expect(screen.getByRole("slider", { name: "Second" })).toHaveValue("2");
  });
});

describe("LabeledSlider - rendering", () => {
  it("renders the formatted value and min/max hint labels", () => {
    render(
      <LabeledSlider
        label="Scale"
        value={0.6}
        onChange={vi.fn()}
        min={0.3}
        max={1.2}
        step={0.05}
        minLabel="Coarser"
        maxLabel="Finer"
        formatValue={(value) => `${value}x`}
      />
    );

    expect(screen.getByText("0.6x")).toBeInTheDocument();
    expect(screen.getByText("Coarser")).toBeInTheDocument();
    expect(screen.getByText("Finer")).toBeInTheDocument();
  });
});
