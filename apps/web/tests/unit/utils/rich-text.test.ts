/**
 * Plaintext descriptions preserve Lexical text boundaries and truncation.
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { richTextToPlainText } from "@/lib/utils/rich-text";

const text = (value: string) => ({ type: "text", version: 1, text: value, format: 0 });
const paragraph = (children: ReturnType<typeof text>[]) => ({ type: "paragraph", version: 1, children });
const document = (children: ReturnType<typeof paragraph>[]) => ({
  root: { type: "root", version: 1, direction: null, format: "" as const, indent: 0, children },
});

describe("richTextToPlainText", () => {
  it("does not insert spaces between inline text nodes", () => {
    const value = document([paragraph([text("Time"), { ...text("Tiles"), format: 1 }, text("!")])]);
    expect(richTextToPlainText(value)).toBe("TimeTiles!");
  });

  it("preserves paragraph boundaries", () => {
    expect(richTextToPlainText(document([paragraph([text("First")]), paragraph([text("Second")])]))).toBe(
      "First\n\nSecond"
    );
  });

  it("returns undefined for missing or empty descriptions", () => {
    expect(richTextToPlainText(null)).toBeUndefined();
    expect(richTextToPlainText(undefined)).toBeUndefined();
    expect(richTextToPlainText(document([]))).toBeUndefined();
    expect(richTextToPlainText(document([paragraph([text("  ")])]))).toBeUndefined();
  });

  it("truncates and trims descriptions at the existing boundary", () => {
    expect(richTextToPlainText(document([paragraph([text("First second")])]), 6)).toBe("First…");
    expect(richTextToPlainText(document([paragraph([text("First")])]), 5)).toBe("First");
  });
});
