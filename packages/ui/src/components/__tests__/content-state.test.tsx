/**
 * Tests for the ContentState component.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UIProvider } from "../../provider";
import { ContentState } from "../content-state";

describe("ContentState", () => {
  it("takes the retry label from UIProvider", () => {
    render(
      <UIProvider labels={{ tryAgain: "Erneut versuchen" }}>
        <ContentState variant="error" onRetry={vi.fn()} />
      </UIProvider>
    );

    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("takes variant titles and subtitles from UIProvider", () => {
    render(
      <UIProvider labels={{ noMatchTitle: "Keine passenden Ergebnisse", noMatchSubtitle: "Filter anpassen" }}>
        <ContentState variant="no-match" />
      </UIProvider>
    );

    expect(screen.getByText("Keine passenden Ergebnisse")).toBeInTheDocument();
    expect(screen.getByText("Filter anpassen")).toBeInTheDocument();
  });
});
