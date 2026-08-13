/**
 * Keyboard reachability of the collapsible filter surfaces.
 *
 * A closed drawer kept every control it renders in the tab order: the desktop panel
 * collapses to `w-0 overflow-hidden` and the mobile sheet is translated off-screen,
 * neither of which removes anything from the a11y tree. Both are `inert` when closed,
 * and the sheet additionally behaves like a dialog (role, modality, focus).
 *
 * @module
 * @category Tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterPanel } from "../../../app/[locale]/(frontend)/explore/_components/filter-panel";
import { MobileFilterSheet } from "../../../app/[locale]/(frontend)/explore/_components/mobile-filter-sheet";
import { cleanup, renderWithProviders, within } from "../../setup/unit/react-render";

// Concurrent tests in one file share the DOM (issue #180), so this suite unmounts
// its own trees — a sheet left mounted keeps its focus trap listening on document.
afterEach(() => {
  cleanup();
});

describe("FilterPanel", () => {
  it("is inert while collapsed", () => {
    const { container, rerender } = renderWithProviders(
      <FilterPanel isOpen={false}>
        <button type="button">Reset filters</button>
      </FilterPanel>
    );

    // ThemeProvider renders a script tag first, so select the panel itself.
    const panel = () => container.querySelector<HTMLElement>("div.shrink-0");
    expect(panel()?.hasAttribute("inert")).toBe(true);

    rerender(
      <FilterPanel isOpen>
        <button type="button">Reset filters</button>
      </FilterPanel>
    );
    expect(panel()?.hasAttribute("inert")).toBe(false);
  });

  it("keeps its children mounted so the width transition still runs", () => {
    const { container } = renderWithProviders(
      <FilterPanel isOpen={false}>
        <button type="button">Reset filters</button>
      </FilterPanel>
    );

    expect(within(container).getByText("Reset filters")).toBeInTheDocument();
  });
});

describe("MobileFilterSheet", () => {
  const renderSheet = (isOpen: boolean) => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const view = renderWithProviders(
      <MobileFilterSheet isOpen={isOpen} onClose={onClose} onOpen={onOpen}>
        <button type="button">Clear dates</button>
      </MobileFilterSheet>
    );
    return { ...view, onClose, onOpen };
  };

  it("is a labelled modal dialog", () => {
    const { container } = renderSheet(true);

    const dialog = within(container).getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The heading names the dialog rather than leaving it announced as "dialog".
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? "")?.textContent).toBe("Filters");
  });

  it("takes the closed sheet and the covered trigger out of the tab order", () => {
    const { container, rerender, onClose, onOpen } = renderSheet(false);
    const scope = within(container);

    expect(scope.getByRole("dialog", { hidden: true }).hasAttribute("inert")).toBe(true);
    // The floating action button is the one control that must stay reachable.
    expect(scope.getByLabelText("Open filters").hasAttribute("inert")).toBe(false);

    rerender(
      <MobileFilterSheet isOpen onClose={onClose} onOpen={onOpen}>
        <button type="button">Clear dates</button>
      </MobileFilterSheet>
    );

    expect(scope.getByRole("dialog").hasAttribute("inert")).toBe(false);
    // ...and once the sheet covers it, the trigger leaves in turn.
    expect(scope.getByLabelText("Open filters").hasAttribute("inert")).toBe(true);
  });

  it("moves focus into the sheet when it opens", () => {
    const { container, rerender, onClose, onOpen } = renderSheet(false);

    rerender(
      <MobileFilterSheet isOpen onClose={onClose} onOpen={onOpen}>
        <button type="button">Clear dates</button>
      </MobileFilterSheet>
    );

    const sheet = within(container).getByRole("dialog");
    expect(sheet.contains(document.activeElement)).toBe(true);
  });
});
