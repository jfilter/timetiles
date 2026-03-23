/**
 * Tests for the embed attribution component.
 *
 * Verifies that the "Powered by TimeTiles" attribution renders correctly
 * and links to the full explore page with the correct view parameter.
 *
 * @module
 * @category Tests
 */
// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { EmbedAttribution } from "@/components/embed/embed-attribution";

import { renderWithProviders } from "../../setup/unit/react-render";

// Mock the view context to control the view slug
const mockUseView = vi.fn();
vi.mock("@/lib/context/view-context", () => ({ useView: () => mockUseView() }));

describe("EmbedAttribution", () => {
  it("renders the powered-by text", () => {
    mockUseView.mockReturnValue({ view: null });
    const { container } = renderWithProviders(<EmbedAttribution />);
    expect(container).toHaveTextContent("Powered by TimeTiles");
  });

  it("links to /explore when no view is active", () => {
    mockUseView.mockReturnValue({ view: null });
    const { container } = renderWithProviders(<EmbedAttribution />);
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/explore");
  });

  it("links to /explore?view=slug when a view is active", () => {
    mockUseView.mockReturnValue({ view: { slug: "city-events" } });
    const { container } = renderWithProviders(<EmbedAttribution />);
    const link = container.querySelector("a");
    expect(link!.getAttribute("href")).toBe("/explore?view=city-events");
  });

  it("opens link in a new tab", () => {
    mockUseView.mockReturnValue({ view: null });
    const { container } = renderWithProviders(<EmbedAttribution />);
    const link = container.querySelector("a");
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toContain("noopener");
  });
});
