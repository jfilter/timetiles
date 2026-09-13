/**
 * Tests for the ChartEmptyState component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UIProvider } from "../../../provider";
import { ChartEmptyState } from "../chart-empty-state";

describe("ChartEmptyState", () => {
  it("takes chart state texts from UIProvider", () => {
    render(
      <UIProvider
        labels={{ chartErrorTitle: "Diagramm konnte nicht geladen werden", errorTitle: "Etwas ist schiefgelaufen" }}
      >
        <ChartEmptyState variant="error" />
      </UIProvider>
    );

    expect(screen.getByText("Diagramm konnte nicht geladen werden")).toBeInTheDocument();
    expect(screen.getByText("Etwas ist schiefgelaufen")).toBeInTheDocument();
  });

  it("falls back to English chart texts", () => {
    render(<ChartEmptyState variant="no-data" />);

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.getByText("Import events to see visualizations")).toBeInTheDocument();
  });
});
