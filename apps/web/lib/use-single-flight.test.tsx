// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSingleFlight } from "./use-single-flight";

/**
 * `disabled={pending}` alone does not stop a double click: both clicks can
 * fire before React re-renders the button disabled. useSingleFlight guards
 * with a ref, written synchronously, so this is proven by calling `run`
 * TWICE inside one `act()` with no render (no await) between the calls —
 * the same shape as a real double click.
 */
describe("useSingleFlight", () => {
  it("ignores a second call fired before the first resolves", async () => {
    let resolveFirst!: () => void;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { result } = renderHook(() => useSingleFlight(handler));

    await act(async () => {
      // Both calls issued with no render/await between them — the double
      // click, not two separate user actions spaced apart.
      void result.current.run();
      void result.current.run();
      resolveFirst();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("allows a new call once the previous one has resolved", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSingleFlight(handler));

    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      await result.current.run();
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("clears pending and unblocks re-entry even when the handler throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useSingleFlight(handler));

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow("boom");
    });
    expect(result.current.pending).toBe(false);

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow("boom");
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("reports pending while the handler is in flight", async () => {
    let resolveFirst!: () => void;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { result } = renderHook(() => useSingleFlight(handler));

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.run();
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolveFirst();
      await runPromise;
    });
    expect(result.current.pending).toBe(false);
  });
});
