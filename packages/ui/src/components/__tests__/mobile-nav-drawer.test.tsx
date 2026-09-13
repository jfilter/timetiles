/**
 * Tests for the MobileNavDrawer component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UIProvider } from "../../provider";
import { MobileNavDrawer, MobileNavDrawerContent, MobileNavDrawerTrigger } from "../mobile-nav-drawer";

const labels = {
  openNavigation: "Menü öffnen",
  navigation: "Menü",
  navigationDescription: "Seitennavigation",
  closeNavigation: "Menü schließen",
};

describe("MobileNavDrawer", () => {
  it("takes trigger, title, description and close texts from UIProvider", () => {
    render(
      <UIProvider labels={labels}>
        <MobileNavDrawer open>
          <MobileNavDrawerTrigger />
          <MobileNavDrawerContent>
            <p>Start</p>
          </MobileNavDrawerContent>
        </MobileNavDrawer>
      </UIProvider>
    );

    expect(screen.getByRole("dialog", { name: "Menü" })).toHaveAccessibleDescription("Seitennavigation");
    expect(screen.getByRole("button", { name: "Menü schließen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menü öffnen", hidden: true })).toBeInTheDocument();
  });

  it("falls back to English texts without a provider", () => {
    render(
      <MobileNavDrawer open>
        <MobileNavDrawerContent>
          <p>Home</p>
        </MobileNavDrawerContent>
      </MobileNavDrawer>
    );

    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toBeInTheDocument();
  });
});
