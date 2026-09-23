import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("debounce — the timing primitive behind the materials search/type-ahead", () => {
  it("does not call the wrapped function immediately", () => {
    const fn = vi.fn();
    debounce(fn, 250)("a");
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls the wrapped function once the delay elapses", () => {
    const fn = vi.fn();
    debounce(fn, 250)("a");
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("resets the timer on every call within the window — only the last call's args fire", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);
    debounced("first keystroke");
    vi.advanceTimersByTime(200);
    debounced("first key");
    vi.advanceTimersByTime(200);
    debounced("first keys");
    vi.advanceTimersByTime(200);
    // Only 200ms has elapsed since the last call at any point — never fires.
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("first keys");
  });

  it("fires again for a call made after a previous call already fired", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);
    debounced("q1");
    vi.advanceTimersByTime(250);
    debounced("q2");
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, "q1");
    expect(fn).toHaveBeenNthCalledWith(2, "q2");
  });

  it("cancel() suppresses a pending call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);
    debounced("a");
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
