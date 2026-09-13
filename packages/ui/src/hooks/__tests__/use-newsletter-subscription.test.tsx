/**
 * Unit tests for the newsletter subscription state machine.
 *
 * @module
 */
// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SyntheticEvent } from "react";
import { describe, expect, it } from "vitest";

import { useNewsletterSubscription } from "../use-newsletter-subscription";

const messages = { success: "Subscribed", error: "Subscription failed", networkError: "Network error" };
const submitEvent = { preventDefault: () => {} } as SyntheticEvent<HTMLFormElement>;

const submitWith = async (failure: Error) => {
  const { result } = renderHook(() => useNewsletterSubscription({ messages, onSubmit: () => Promise.reject(failure) }));

  act(() => result.current.setEmail("reader@example.com"));
  act(() => result.current.handleSubmit(submitEvent));
  await waitFor(() => expect(result.current.status).toBe("error"));

  return result.current.message;
};

describe("useNewsletterSubscription", () => {
  it("shows the network error message when the request cannot be sent", async () => {
    // fetch rejects with a TypeError when the network fails
    expect(await submitWith(new TypeError("Failed to fetch"))).toBe("Network error");
  });

  it("shows the localized error message instead of the server text", async () => {
    expect(await submitWith(new Error("Too many requests"))).toBe("Subscription failed");
  });
});
