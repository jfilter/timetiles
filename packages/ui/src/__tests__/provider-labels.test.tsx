/**
 * Tests for the built-in UI texts supplied through UIProvider.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/dialog";
import { UIProvider, useUILabels } from "../provider";

describe("useUILabels", () => {
  it("returns English defaults without a provider", () => {
    const { result } = renderHook(() => useUILabels());

    expect(result.current.tryAgain).toBe("Try again");
    expect(result.current.pageOf(2, 5)).toBe("Page 2 of 5");
  });

  it("merges provided labels over the English defaults", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <UIProvider labels={{ tryAgain: "Erneut versuchen" }}>{children}</UIProvider>
    );
    const { result } = renderHook(() => useUILabels(), { wrapper });

    expect(result.current.tryAgain).toBe("Erneut versuchen");
    expect(result.current.cancel).toBe("Cancel");
  });
});

describe("DialogContent close button", () => {
  const renderDialog = () => (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Description</DialogDescription>
      </DialogContent>
    </Dialog>
  );

  it("is named with the English default", () => {
    render(renderDialog());

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("is named with the provided translation", () => {
    render(<UIProvider labels={{ close: "Schließen" }}>{renderDialog()}</UIProvider>);

    expect(screen.getByRole("button", { name: "Schließen" })).toBeInTheDocument();
  });
});
