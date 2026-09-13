/**
 * Tests for the shared newsletter UI primitives.
 *
 * Focuses on the status message being announced to assistive technology.
 *
 * @module
 */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { UIProvider } from "../../provider";
import { NewsletterCTA } from "../newsletter-cta";
import { NewsletterForm } from "../newsletter-form";
import { NewsletterStatusMessage } from "../newsletter-shared";

describe("NewsletterStatusMessage - live region", () => {
  it("renders a polite status live region for a success message", () => {
    render(<NewsletterStatusMessage errorId="newsletter-error" status="success" message="You are subscribed." />);

    const region = screen.getByRole("status");

    expect(region).toHaveTextContent("You are subscribed.");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("renders an assertive alert live region for an error message", () => {
    render(<NewsletterStatusMessage errorId="newsletter-error" status="error" message="Something went wrong." />);

    const region = screen.getByRole("alert");

    expect(region).toHaveTextContent("Something went wrong.");
  });

  it("renders the live region in the decorated variant too", () => {
    render(
      <NewsletterStatusMessage errorId="newsletter-error" status="success" message="You are subscribed." decorated />
    );

    expect(screen.getByRole("status")).toHaveTextContent("You are subscribed.");
  });

  it("keeps the live region mounted while idle so later messages are announced", () => {
    const { container, rerender } = render(
      <NewsletterStatusMessage errorId="newsletter-error" status="idle" message="" />
    );

    const region = container.querySelector("[aria-live]");
    expect(region).not.toBeNull();
    expect(region).toBeEmptyDOMElement();

    rerender(<NewsletterStatusMessage errorId="newsletter-error" status="success" message="You are subscribed." />);

    // Same live region node must be reused, otherwise screen readers may miss the update.
    expect(container.querySelector("[aria-live]")).toBe(region);
    expect(region).toHaveTextContent("You are subscribed.");
  });
});

const messages = { success: "Subscribed!", error: "Subscription failed.", networkError: "Network error." };

describe.each([
  {
    name: "NewsletterForm",
    renderForm: (): ReactNode => (
      <NewsletterForm messages={messages} onSubmit={() => Promise.reject(new Error("fail"))} />
    ),
  },
  {
    name: "NewsletterCTA",
    renderForm: (): ReactNode => (
      <NewsletterCTA messages={messages} onSubmit={() => Promise.reject(new Error("fail"))} />
    ),
  },
])("$name - email input accessibility", ({ renderForm }) => {
  it("labels the email input with the English default", () => {
    render(renderForm());

    expect(screen.getByRole("textbox", { name: "Email address" })).toBeInTheDocument();
  });

  it("labels the email input with the provided translation", () => {
    render(<UIProvider labels={{ emailAddress: "E-Mail-Adresse" }}>{renderForm()}</UIProvider>);

    expect(screen.getByRole("textbox", { name: "E-Mail-Adresse" })).toBeInTheDocument();
  });

  it("marks the input invalid and describes it with the error message", async () => {
    const user = userEvent.setup();
    render(renderForm());

    const input = screen.getByRole("textbox", { name: "Email address" });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");

    await user.type(input, "reader@example.org");
    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAccessibleDescription(screen.getByRole("alert").textContent ?? "");
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
  });
});
