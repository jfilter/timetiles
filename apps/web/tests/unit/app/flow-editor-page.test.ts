/**
 * Unit tests for the flow editor page search param parsing.
 *
 * @module
 * @category Tests
 */
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ FlowEditorWrapper: vi.fn(() => null) }));

vi.mock("@/app/[locale]/(frontend)/import/flow-editor/_components/flow-editor-wrapper", () => ({
  FlowEditorWrapper: mocks.FlowEditorWrapper,
}));

import FlowEditorPage from "@/app/[locale]/(frontend)/import/flow-editor/page";

describe("FlowEditorPage", () => {
  it("ignores partially numeric search params", async () => {
    const element = (await FlowEditorPage({
      searchParams: Promise.resolve({ previewId: "preview-1", sheetIndex: "1abc" }),
    })) as ReactElement<{ previewId: string | null; sheetIndex: number }>;

    expect(element.props.previewId).toBe("preview-1");
    expect(element.props.sheetIndex).toBe(0);
  });
});
