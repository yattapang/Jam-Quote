// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import ToastProvider, { useToast } from "./ToastProvider";

function Trigger({ message = "Client saved" }: { message?: string }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message)}>fire</button>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a message with role=status and aria-live=polite", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => { fireEvent.click(screen.getByText("fire")); });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Client saved");
  });

  it("auto-dismisses after a few seconds", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => { fireEvent.click(screen.getByText("fire")); });
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pauses dismissal while the toast is focused, and resumes after blur", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => { fireEvent.click(screen.getByText("fire")); });
    const status = screen.getByRole("status");
    act(() => {
      status.focus();
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    // Still present — dismissal paused while focused.
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      status.blur();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
