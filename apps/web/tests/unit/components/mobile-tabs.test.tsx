/**
 * Keyboard behaviour of the explore mobile tab bar.
 *
 * @module
 * @category Tests
 */
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MobileTabs } from "@/app/[locale]/(frontend)/(app)/explore/_components/mobile-tabs";

import { renderWithProviders, screen, userEvent } from "../../setup/unit/react-render";

const ControlledTabs = () => {
  const [tab, setTab] = useState<"map" | "chart" | "list">("map");
  return (
    <MobileTabs
      activeTab={tab}
      onTabChange={setTab}
      mapContent={<p>map panel</p>}
      chartContent={<p>chart panel</p>}
      listContent={<p>list panel</p>}
    />
  );
};

describe("MobileTabs", () => {
  it("moves focus and selection with arrow, Home and End keys", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ControlledTabs />);

    await user.tab();
    expect(screen.getByRole("tab", { name: "Map" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const chart = screen.getByRole("tab", { name: "Chart" });
    expect(chart).toHaveFocus();
    expect(chart).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("chart panel")).toBeInTheDocument();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "List" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Map" })).toHaveFocus();
    expect(screen.getByText("map panel")).toBeInTheDocument();
  });

  it("has a single tab stop and only points the active tab at a rendered panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ControlledTabs />);

    expect(screen.getByRole("tablist")).not.toHaveAttribute("tabindex");
    await user.tab();
    await user.tab();
    expect(screen.getByRole("tab", { name: "Map" })).not.toHaveFocus();

    for (const tab of screen.getAllByRole("tab")) {
      const controls = tab.getAttribute("aria-controls");
      if (tab.getAttribute("aria-selected") === "true") {
        expect(controls).not.toBeNull();
        expect(document.getElementById(controls ?? "")).toHaveAttribute("role", "tabpanel");
      } else {
        expect(controls).toBeNull();
      }
    }
  });
});
