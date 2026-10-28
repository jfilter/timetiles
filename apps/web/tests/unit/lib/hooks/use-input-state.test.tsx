// @vitest-environment jsdom
/**
 * Unit tests for the input state hook.
 *
 * @module
 * @category Tests
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useInputState } from "../../../../lib/hooks/use-input-state";

describe("useInputState", () => {
  it("adopts a value the input already holds when it mounts", () => {
    const { result } = renderHook(() => useInputState());
    const input = document.createElement("input");
    input.value = "autofilled@example.com";

    act(() => result.current[1].ref(input));

    expect(result.current[0]).toBe("autofilled@example.com");
    expect(result.current[1].value).toBe("autofilled@example.com");
  });

  it("keeps the initial value when the input mounts empty", () => {
    const { result } = renderHook(() => useInputState("initial"));

    act(() => result.current[1].ref(document.createElement("input")));

    expect(result.current[0]).toBe("initial");
  });

  it("tracks changes and reports them", () => {
    const onValueChange = vi.fn();
    const { result } = renderHook(() => useInputState("", onValueChange));

    act(() => result.current[1].onChange({ target: { value: "typed" } } as React.ChangeEvent<HTMLInputElement>));

    expect(result.current[0]).toBe("typed");
    expect(onValueChange).toHaveBeenCalledOnce();
  });
});
