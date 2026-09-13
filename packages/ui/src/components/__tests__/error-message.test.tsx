/**
 * Tests for the ErrorMessage component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ErrorMessage } from "../error-message";

describe("ErrorMessage", () => {
  it("uses the provided retry label", () => {
    render(<ErrorMessage variant="box" message="Fehler" onRetry={vi.fn()} retryLabel="Erneut versuchen" />);

    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("falls back to an English retry label", () => {
    render(<ErrorMessage variant="box" message="Failed" onRetry={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
