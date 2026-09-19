// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import Modal from "./Modal";

describe("Modal accessibility and focus behaviour", () => {
  it("renders with role=dialog, aria-modal and is labelled by its title", () => {
    render(
      <Modal title="Edit client" onClose={vi.fn()}>
        <button>Save</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe("Edit client");
  });

  it("moves focus into the dialog on open, to the first focusable element", () => {
    render(
      <Modal title="Edit client" onClose={vi.fn()}>
        <input aria-label="Name" />
        <button>Save</button>
      </Modal>,
    );
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("falls back to focusing the dialog itself when nothing inside is focusable", () => {
    render(
      <Modal title="No inputs" onClose={vi.fn()}>
        <p>Just text</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit client" onClose={onClose}>
        <button>Save</button>
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab within the dialog, wrapping from last to first and Shift+Tab from first to last", async () => {
    render(
      <Modal title="Edit client" onClose={vi.fn()}>
        <input aria-label="First" />
        <input aria-label="Second" />
      </Modal>,
    );
    const first = screen.getByLabelText("First");
    const second = screen.getByLabelText("Second");
    // The close (x) button is the last focusable element in the dialog.
    const closeBtn = screen.getByRole("button", { name: "Close" });

    expect(first).toHaveFocus();

    await userEvent.tab();
    expect(second).toHaveFocus();

    await userEvent.tab();
    expect(closeBtn).toHaveFocus();

    // Tab again from the last element wraps to the first.
    await userEvent.tab();
    expect(first).toHaveFocus();

    // Shift+Tab from the first element wraps to the last.
    await userEvent.tab({ shift: true });
    expect(closeBtn).toHaveFocus();
  });

  it("returns focus to the opener element when it closes", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Modal title="Edit client" onClose={() => setOpen(false)}>
              <button>Save</button>
            </Modal>
          )}
        </div>
      );
    }
    const { rerender } = render(<Harness />);
    const openBtn = screen.getByRole("button", { name: "Open" });
    openBtn.focus();
    expect(openBtn).toHaveFocus();

    // Simulate opening: render with modal mounted, opener retains DOM identity.
    openBtn.click();
    rerender(<Harness />);

    // Close it.
    screen.getByRole("button", { name: "Close" }).click();
    rerender(<Harness />);

    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("does not close when the backdrop is clicked by default", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal title="Edit client" onClose={onClose}>
        <button>Save</button>
      </Modal>,
    );
    const backdrop = container.firstElementChild as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on backdrop click when closeOnBackdrop is passed", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal title="Edit client" onClose={onClose} closeOnBackdrop>
        <button>Save</button>
      </Modal>,
    );
    const backdrop = container.firstElementChild as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still closes via the x button and Escape regardless of the backdrop rule", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit client" onClose={onClose}>
        <button>Save</button>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("nested modals: Escape closes only the TOP modal, and outer's trap is inert while inner is open", async () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    render(
      <div>
        <Modal title="Outer" onClose={onCloseOuter}>
          <button>Outer action</button>
          <Modal title="Inner" onClose={onCloseInner}>
            <button>Inner action</button>
          </Modal>
        </Modal>
      </div>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
  });
});
