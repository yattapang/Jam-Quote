// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AppLoading from "./loading";

describe("app-wide loading fallback", () => {
  it("renders a status region with an accessible label", () => {
    render(<AppLoading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAccessibleName(/loading/i);
  });
});
