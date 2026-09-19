// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ToastProvider, { useToast } from "./ToastProvider";

/**
 * The real app mounts ToastProvider once, in app/(app)/layout.tsx, ABOVE the
 * routed page. Next's app router keeps that layout mounted across a
 * client-side navigation within the same segment — only the page content
 * underneath is swapped — so a toast fired right before router.push()
 * survives into the page that follows, with no query-flag or
 * sessionStorage relay needed.
 *
 * This is modelled here as: the provider (standing in for the layout) wraps
 * BOTH the "old page" and, after a push, the "new page" — its own state is
 * never torn down by the navigation, exactly like the real layout tree.
 */
function OldPage({ onSave }: { onSave: () => void }) {
  const { showToast } = useToast();
  return (
    <button
      onClick={() => {
        showToast("Quote saved");
        onSave(); // stand-in for router.push("/quotes/123")
      }}
    >
      save and go
    </button>
  );
}

function NewPage() {
  return <p>Quote detail page</p>;
}

describe("Toast survives a save-then-navigate", () => {
  it("keeps showing the message after the page underneath changes", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [navigated, setNavigated] = useState(false);
      return (
        <ToastProvider>
          {navigated ? <NewPage /> : <OldPage onSave={() => setNavigated(true)} />}
        </ToastProvider>
      );
    }

    render(<Harness />);
    await user.click(screen.getByText("save and go"));

    // The page underneath has swapped...
    expect(screen.getByText("Quote detail page")).toBeInTheDocument();
    // ...but the toast, owned by the provider above it, is still there.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Quote saved");
  });
});
