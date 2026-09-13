/**
 * Tests for the MobileNavDrawer component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MobileNavDrawer, MobileNavDrawerContent, MobileNavDrawerTrigger } from "../mobile-nav-drawer";

describe("MobileNavDrawer", () => {
  it("uses the provided title, description and close label", () => {
    render(
      <MobileNavDrawer open>
        <MobileNavDrawerTrigger aria-label="Menü öffnen" />
        <MobileNavDrawerContent title="Menü" description="Seitennavigation" closeLabel="Menü schließen">
          <a href="/">Start</a>
        </MobileNavDrawerContent>
      </MobileNavDrawer>
    );

    expect(screen.getByRole("dialog", { name: "Menü" })).toHaveAccessibleDescription("Seitennavigation");
    expect(screen.getByRole("button", { name: "Menü schließen" })).toBeInTheDocument();
  });

  it("falls back to English texts", () => {
    render(
      <MobileNavDrawer open>
        <MobileNavDrawerContent>
          <a href="/">Home</a>
        </MobileNavDrawerContent>
      </MobileNavDrawer>
    );

    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toBeInTheDocument();
  });
});
