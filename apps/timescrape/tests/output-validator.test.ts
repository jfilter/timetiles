import { describe, expect, it } from "vitest";

import { validateOutput } from "../src/services/output-validator.js";

describe("validateOutput", () => {
  it("accepts valid CSV content", () => {
    const content = Buffer.from("title,date,location\nEvent,2026-01-01,Berlin\n");
    expect(() => validateOutput(content)).not.toThrow();
  });

  it("accepts empty content — a scrape that found nothing is still valid", () => {
    // A listing page with no entries today is a correct result, not a fault.
    // Rejecting it here turned every legitimately-empty scrape into a failed
    // run. The caller decides success from whether the file EXISTS.
    const content = Buffer.from("");
    expect(() => validateOutput(content)).not.toThrow();
  });

  it("rejects content with empty header", () => {
    const content = Buffer.from("\ndata,here\n");
    expect(() => validateOutput(content)).toThrow("no header");
  });

  it("accepts single-line CSV (header only)", () => {
    const content = Buffer.from("title,date,location\n");
    expect(() => validateOutput(content)).not.toThrow();
  });
});
