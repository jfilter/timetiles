// @vitest-environment jsdom
/**
 * Unit tests for the SSR-safe client hooks `useMediaQuery` and `useMounted`.
 *
 * Both must render a neutral value on the server and the live value on the
 * client; `useMediaQuery` must also follow `change` events of its query.
 *
 * @module
 * @category Tests
 */
import { act, renderHook } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useMounted } from "@/lib/hooks/use-theme";

const fakeMediaQueries = (initial: Record<string, boolean>) => {
  const state = { ...initial };
  const listeners = new Map<string, Set<() => void>>();
  const listenersFor = (query: string) => listeners.get(query) ?? listeners.set(query, new Set()).get(query)!;

  vi.mocked(globalThis.matchMedia).mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return state[query] ?? false;
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => listenersFor(query).add(cb),
        removeEventListener: (_: string, cb: () => void) => listenersFor(query).delete(cb),
      }) as unknown as MediaQueryList
  );

  return {
    set: (query: string, matches: boolean) => {
      state[query] = matches;
      listenersFor(query).forEach((cb) => cb());
    },
    listenerCount: (query: string) => listenersFor(query).size,
  };
};

const Probe = ({ query }: { query: string }) => <span>{String(useMediaQuery(query))}</span>;
const MountedProbe = () => <span>{String(useMounted())}</span>;

describe("useMediaQuery", () => {
  afterEach(() => {
    vi.mocked(globalThis.matchMedia).mockClear();
  });

  it("renders null on the server", () => {
    expect(renderToStaticMarkup(<Probe query="(min-width: 768px)" />)).toBe("<span>null</span>");
  });

  it("returns the current match and follows change events", () => {
    const mq = fakeMediaQueries({ "(min-width: 768px)": true });
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(true);
    act(() => mq.set("(min-width: 768px)", false));
    expect(result.current).toBe(false);
  });

  it("moves its subscription when the query changes", () => {
    const mq = fakeMediaQueries({ narrow: false, wide: true });
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), { initialProps: { query: "narrow" } });

    expect(result.current).toBe(false);
    rerender({ query: "wide" });

    expect(result.current).toBe(true);
    expect(mq.listenerCount("narrow")).toBe(0);
    expect(mq.listenerCount("wide")).toBe(1);
  });
});

describe("useMounted", () => {
  it("is false on the server and true on the client", () => {
    expect(renderToStaticMarkup(<MountedProbe />)).toBe("<span>false</span>");
    expect(renderHook(() => useMounted()).result.current).toBe(true);
  });
});
