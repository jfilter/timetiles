/**
 * Unit tests for the flow editor page search param parsing.
 *
 * @module
 * @category Tests
 */
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ FlowEditorWrapper: vi.fn(() => null) }));

vi.mock("@/app/(frontend)/import/flow-editor/_components/flow-editor-wrapper", () => ({
  FlowEditorWrapper: mocks.FlowEditorWrapper,
}));

import FlowEditorPage from "@/app/(frontend)/import/flow-editor/page";

describe("FlowEditorPage", () => {
  it("ignores partially numeric search params", async () => {
    const element = (await FlowEditorPage({
      searchParams: Promise.resolve({
        previewId: "preview-1",
        sheetIndex: "1abc",
        scheduleId: "2e3",
        datasetId: "4xyz",
      }),
    })) as ReactElement<{
      previewId: string | null;
      sheetIndex: number;
      scheduleId: number | null;
      datasetId: number | null;
    }>;

    expect(element.props.previewId).toBe("preview-1");
    expect(element.props.sheetIndex).toBe(0);
    expect(element.props.scheduleId).toBeNull();
    expect(element.props.datasetId).toBeNull();
  });
});
