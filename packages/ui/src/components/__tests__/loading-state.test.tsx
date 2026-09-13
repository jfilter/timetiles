/**
 * Tests for the LoadingState component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingState } from "../loading-state";

describe("LoadingState", () => {
  it("announces the skeleton with the provided label", () => {
    render(<LoadingState variant="skeleton" label="Wird geladen" />);

    expect(screen.getByRole("status", { name: "Wird geladen" })).toBeInTheDocument();
  });

  it("falls back to an English skeleton label", () => {
    render(<LoadingState variant="skeleton" />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
