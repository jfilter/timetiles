/**
 * Tests for the ConfirmDialog component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UIProvider } from "../../provider";
import { ConfirmDialog } from "../confirm-dialog";

const renderDialog = (props: { confirmLabel?: string } = {}) =>
  render(
    <UIProvider labels={{ confirm: "Bestätigen", cancel: "Abbrechen" }}>
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Löschen?"
        description="Endgültig."
        onConfirm={vi.fn()}
        {...props}
      />
    </UIProvider>
  );

describe("ConfirmDialog", () => {
  it("takes confirm and cancel labels from UIProvider", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Bestätigen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  });

  it("lets an explicit label override the provider", () => {
    renderDialog({ confirmLabel: "Löschen" });

    expect(screen.getByRole("button", { name: "Löschen" })).toBeInTheDocument();
  });
});
