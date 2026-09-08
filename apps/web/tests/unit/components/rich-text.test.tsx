/**
 * Verify Payload editor states render through the native Lexical converter.
 *
 * @module
 * @category Tests
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RichText } from "@/components/layout/rich-text";
import { createRichTextWithFormatting } from "@/tests/setup/factories";

describe("RichText", () => {
  it.each(["bold", "italic"] as const)("preserves %s formatting from Payload", (format) => {
    const { container, getByText } = render(
      <RichText content={createRichTextWithFormatting("Formatted content", format)} />
    );
    expect(getByText("Formatted content").closest(format === "bold" ? "strong" : "em")).not.toBeNull();
    expect(container.querySelector(".prose")).not.toBeNull();
  });

  it.each([null, undefined])("renders no text for absent content %s", (content) => {
    const { container } = render(<RichText content={content} />);
    expect(container.textContent).toBe("");
  });
});
