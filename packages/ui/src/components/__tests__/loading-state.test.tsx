/**
 * Tests for the LoadingState component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UIProvider } from "../../provider";
import { LoadingState } from "../loading-state";

describe("LoadingState", () => {
  it("announces the skeleton and text variants with the label from UIProvider", () => {
    render(
      <UIProvider labels={{ loading: "Wird geladen..." }}>
        <LoadingState variant="skeleton" />
        <LoadingState variant="text" />
      </UIProvider>
    );

    expect(screen.getByRole("status", { name: "Wird geladen..." })).toBeInTheDocument();
    expect(screen.getAllByText("Wird geladen...")).toHaveLength(2);
  });

  it("falls back to an English label", () => {
    render(<LoadingState variant="skeleton" />);

    expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
  });
});
