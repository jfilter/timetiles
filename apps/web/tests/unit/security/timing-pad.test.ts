/**
 * Unit tests for the timing-pad helper that equalizes response times.
 *
 * @module
 * @category Tests
 */
import { withTimingPad } from "@/lib/security/timing-pad";

const PENDING = Symbol("pending");

/** Resolves to PENDING while `promise` is unsettled, otherwise settles like it. */
const peek = <T>(promise: Promise<T>) => Promise.race([promise, Promise.resolve(PENDING)]);

describe("withTimingPad", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the result only after the minimum duration", async () => {
    const promise = withTimingPad(1000, () => Promise.resolve("ok"));

    await vi.advanceTimersByTimeAsync(999);
    await expect(peek(promise)).resolves.toBe(PENDING);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe("ok");
  });

  it("rethrows a failure only after the minimum duration", async () => {
    const error = new Error("boom");
    const promise = withTimingPad(1000, () => Promise.reject(error));

    await vi.advanceTimersByTimeAsync(999);
    await expect(peek(promise)).resolves.toBe(PENDING);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).rejects.toBe(error);
  });

  it("rethrows falsy rejection values instead of resolving", async () => {
    const outcome = Promise.allSettled([withTimingPad(10, vi.fn<() => Promise<string>>().mockRejectedValue(0))]);

    await vi.advanceTimersByTimeAsync(10);
    await expect(outcome).resolves.toEqual([{ status: "rejected", reason: 0 }]);
  });

  it("adds no delay when the operation already took longer", async () => {
    const promise = withTimingPad(100, async () => {
      await vi.advanceTimersByTimeAsync(150);
      return "slow";
    });

    await expect(promise).resolves.toBe("slow");
    expect(vi.getTimerCount()).toBe(0);
  });
});
