/**
 * Shared field-label formatting tests.
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { formatFieldLabel } from "@/lib/utils/format";

describe("formatFieldLabel", () => {
  it.each([
    ["event_type", "Event Type"],
    ["eventType", "Event Type"],
    ["event-type", "Event Type"],
    [" event__type ", "Event Type"],
    ["location.event_type", "Location.Event Type"],
    ["", ""],
  ])("formats %j as %j", (path, label) => {
    expect(formatFieldLabel(path)).toBe(label);
  });
});
