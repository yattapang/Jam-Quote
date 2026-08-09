import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relativeTime } from "./relative-time";

// Pinned so the boundaries below are exact rather than "whenever the suite ran".
const NOW = new Date("2026-08-09T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function agoMs(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime — the 'updated N ago' label on supplier prices and admin feeds", () => {
  it("renders a dash for a missing timestamp rather than an epoch date", () => {
    expect(relativeTime(null)).toBe("—");
  });

  it("renders a dash for an unparseable timestamp instead of NaN", () => {
    expect(relativeTime("not a date")).toBe("—");
  });

  it("floors a just-recorded price to 1m rather than 0m", () => {
    expect(relativeTime(agoMs(0))).toBe("1m ago");
    expect(relativeTime(agoMs(5_000))).toBe("1m ago");
  });

  it("counts in minutes below an hour", () => {
    expect(relativeTime(agoMs(9 * MINUTE))).toBe("9m ago");
    expect(relativeTime(agoMs(59 * MINUTE))).toBe("59m ago");
  });

  it("switches to hours at exactly one hour", () => {
    expect(relativeTime(agoMs(HOUR))).toBe("1h ago");
    expect(relativeTime(agoMs(23 * HOUR))).toBe("23h ago");
  });

  it("switches to days at exactly one day", () => {
    expect(relativeTime(agoMs(DAY))).toBe("1d ago");
    expect(relativeTime(agoMs(6 * DAY))).toBe("6d ago");
  });

  it("truncates rather than rounds, so a price is never reported fresher than it is", () => {
    expect(relativeTime(agoMs(2 * DAY - MINUTE))).toBe("1d ago");
    expect(relativeTime(agoMs(2 * HOUR - MINUTE))).toBe("1h ago");
  });

  it("still reports a minute for a future timestamp (a back-dated entry typo)", () => {
    expect(relativeTime(new Date(NOW.getTime() + HOUR).toISOString())).toBe("1m ago");
  });
});
