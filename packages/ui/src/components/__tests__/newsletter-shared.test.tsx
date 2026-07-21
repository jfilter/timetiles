/**
 * Tests for the shared newsletter UI primitives.
 *
 * Focuses on the status message being announced to assistive technology.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NewsletterStatusMessage } from "../newsletter-shared";

describe("NewsletterStatusMessage - live region", () => {
  it("renders a polite status live region for a success message", () => {
    render(<NewsletterStatusMessage status="success" message="You are subscribed." />);

    const region = screen.getByRole("status");

    expect(region).toHaveTextContent("You are subscribed.");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("renders an assertive alert live region for an error message", () => {
    render(<NewsletterStatusMessage status="error" message="Something went wrong." />);

    const region = screen.getByRole("alert");

    expect(region).toHaveTextContent("Something went wrong.");
  });

  it("renders the live region in the decorated variant too", () => {
    render(<NewsletterStatusMessage status="success" message="You are subscribed." decorated />);

    expect(screen.getByRole("status")).toHaveTextContent("You are subscribed.");
  });

  it("keeps the live region mounted while idle so later messages are announced", () => {
    const { container, rerender } = render(<NewsletterStatusMessage status="idle" message="" />);

    const region = container.querySelector("[aria-live]");
    expect(region).not.toBeNull();
    expect(region).toBeEmptyDOMElement();

    rerender(<NewsletterStatusMessage status="success" message="You are subscribed." />);

    // Same live region node must be reused, otherwise screen readers may miss the update.
    expect(container.querySelector("[aria-live]")).toBe(region);
    expect(region).toHaveTextContent("You are subscribed.");
  });
});
