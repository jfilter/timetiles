/**
 * Tests for the modal focus trap.
 *
 * The mobile filter sheet is a hand-rolled dialog, so the three things Radix would
 * otherwise provide are asserted here: focus moves in on open, Tab cycles instead of
 * escaping behind the sheet, and focus returns to the trigger on close.
 *
 * @module
 * @category Tests
 */

import { useRef } from "react";
import { describe, expect, it } from "vitest";

import { useFocusTrap } from "@/lib/hooks/use-focus-trap";

import { renderWithProviders, userEvent, within } from "../../setup/unit/react-render";

const Trapped = ({ isActive }: { isActive: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, isActive);

  return (
    <div>
      <button type="button">outside</button>
      <div ref={containerRef}>
        <button type="button">first</button>
        <button type="button">last</button>
      </div>
    </div>
  );
};

describe("useFocusTrap", () => {
  it("moves focus to the first control when it activates", () => {
    const { container, rerender } = renderWithProviders(<Trapped isActive={false} />);

    rerender(<Trapped isActive />);

    expect(document.activeElement).toBe(within(container).getByText("first"));
  });

  it("wraps Tab from the last control back to the first", async () => {
    const { container } = renderWithProviders(<Trapped isActive />);
    const scope = within(container);

    scope.getByText("last").focus();
    await userEvent.tab();

    expect(document.activeElement).toBe(scope.getByText("first"));
  });

  it("wraps Shift+Tab from the first control to the last", async () => {
    const { container } = renderWithProviders(<Trapped isActive />);
    const scope = within(container);

    scope.getByText("first").focus();
    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(scope.getByText("last"));
  });

  it("restores focus to the trigger when it deactivates", () => {
    const { container, rerender } = renderWithProviders(<Trapped isActive={false} />);
    const trigger = within(container).getByText("outside");

    trigger.focus();
    rerender(<Trapped isActive />);
    expect(document.activeElement).not.toBe(trigger);

    rerender(<Trapped isActive={false} />);
    expect(document.activeElement).toBe(trigger);
  });
});
