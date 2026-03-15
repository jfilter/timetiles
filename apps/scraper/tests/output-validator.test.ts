import { describe, expect, it } from "vitest";

import { validateOutput } from "../src/services/output-validator.js";

describe("validateOutput", () => {
  it("accepts valid CSV content", async () => {
    const content = Buffer.from("title,date,location\nEvent,2026-01-01,Berlin\n");
    await expect(validateOutput(content, 100)).resolves.toBeUndefined();
  });

  it("rejects empty content", async () => {
    const content = Buffer.from("");
    await expect(validateOutput(content, 100)).rejects.toThrow("empty");
  });

  it("rejects content exceeding size limit", async () => {
    const content = Buffer.alloc(2 * 1024 * 1024, "a"); // 2MB
    await expect(validateOutput(content, 1)).rejects.toThrow("exceeds limit");
  });

  it("rejects content with empty header", async () => {
    const content = Buffer.from("\ndata,here\n");
    await expect(validateOutput(content, 100)).rejects.toThrow("no header");
  });

  it("accepts single-line CSV (header only)", async () => {
    const content = Buffer.from("title,date,location\n");
    await expect(validateOutput(content, 100)).resolves.toBeUndefined();
  });
});
