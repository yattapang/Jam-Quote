// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/quotes",
}));
vi.mock("@/lib/auth-actions", () => ({
  logout: vi.fn(),
}));

import Sidebar from "./Sidebar";

/**
 * The closed off-canvas drawer (mobile) sits at left:-288px but was still in
 * the DOM's normal tab order, so keyboard focus could vanish onto
 * off-screen links. It must be inert (unfocusable, hidden from AT) while
 * closed, and restored to normal once opened. The active nav link must
 * also carry aria-current="page" for AT users.
 */
function setMobileViewport() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sidebar mobile drawer", () => {
  it("is inert and unfocusable while closed on mobile", () => {
    setMobileViewport();
    render(<Sidebar session={null} />);

    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    // jsdom doesn't implement the `inert` IDL property's focus-suppressing
    // behavior, so assert the attribute itself is present (the browser's
    // native inert behavior then applies from this attribute).
    expect((nav as HTMLElement).hasAttribute("inert")).toBe(true);
    expect((nav as HTMLElement).getAttribute("aria-hidden")).toBe("true");
  });

  it("becomes focusable once opened", async () => {
    setMobileViewport();
    render(<Sidebar session={null} />);

    const openButton = screen.getByRole("button", { name: /open navigation menu/i });
    await userEvent.click(openButton);

    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    expect((nav as HTMLElement).hasAttribute("inert")).toBe(false);

    const quotesLink = screen.getByRole("link", { name: /quotes/i });
    quotesLink.focus();
    expect(quotesLink).toHaveFocus();
  });

  it("marks the active nav link with aria-current=page", () => {
    setMobileViewport();
    render(<Sidebar session={null} />);

    const activeLink = screen.getByRole("link", { name: /quotes/i, hidden: true });
    expect(activeLink).toHaveAttribute("aria-current", "page");

    const inactiveLink = screen.getByRole("link", { name: /clients/i, hidden: true });
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });
});
