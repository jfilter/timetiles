/**
 * Tests for the MapControlPopover component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MapControlPopover } from "../map-control-popover";

const renderPopover = () =>
  render(
    <MapControlPopover
      trigger={({ onClick, isOpen }) => (
        <button type="button" onClick={onClick} aria-expanded={isOpen}>
          Settings
        </button>
      )}
    >
      <p>Panel content</p>
    </MapControlPopover>
  );

describe("MapControlPopover", () => {
  it("opens the panel from the trigger", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the panel when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
  });
});
