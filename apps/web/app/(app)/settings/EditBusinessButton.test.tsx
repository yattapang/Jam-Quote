// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Business } from "@/lib/types";

/**
 * Cancel sat inside the `<form>` with no explicit `type`, and `Button` had no
 * default — so a native `<button>` defaults to `type="submit"`, and clicking
 * Cancel submitted the edit instead of discarding it. Save also had no
 * `disabled={saving}`, so a double click sent two PATCH requests.
 *
 * This renders the real modal (mocked `updateBusiness`) and asserts both
 * behaviourally: Cancel fires no update, and a double-click Save fires one.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  updateBusiness: vi.fn().mockResolvedValue({ id: "biz-1" }),
}));

import EditBusinessButton from "./EditBusinessButton";

// Rendering a form and driving it with userEvent exceeds vitest's 5s default under the
// full parallel run; this was intermittently timing out, a harness limit, not behaviour.
vi.setConfig({ testTimeout: 30_000 });

function business(over: Partial<Business> = {}): Business {
  return {
    id: "biz-1",
    name: "Marcia's Construction",
    trn: "102458963",
    town: "Ocho Rios",
    parish: "St. Ann",
    tradeType: "General contractor",
    addressLine: "12 Main St",
    defaultGctRatePct: 15,
    countryCode: "JM",
    currency: "JMD",
    billingContactName: "",
    billingContactEmail: "",
    gctRegistered: false,
    ...over,
  };
}

beforeEach(() => {
  refresh.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditBusinessButton — Cancel", () => {
  it("does NOT save when Cancel is clicked", async () => {
    const { updateBusiness } = await import("@/lib/api-client");
    const user = userEvent.setup();
    render(<EditBusinessButton business={business()} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateBusiness).not.toHaveBeenCalled();
    expect(screen.queryByText("Edit business profile")).not.toBeInTheDocument();
  });
});

describe("EditBusinessButton — Save", () => {
  it("sends only one update on a double click", async () => {
    const { updateBusiness } = await import("@/lib/api-client");
    const user = userEvent.setup();
    render(<EditBusinessButton business={business()} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const save = screen.getByRole("button", { name: /save changes/i });
    await user.dblClick(save);

    expect(updateBusiness).toHaveBeenCalledTimes(1);
  });
});

describe("EditBusinessButton — GCT registered", () => {
  const question = () => screen.getByRole("combobox", { name: /registered to charge gct/i });

  it("explains that a TRN alone is not registration", async () => {
    const user = userEvent.setup();
    render(<EditBusinessButton business={business()} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/having a trn alone does not mean you are registered/i)).toBeInTheDocument();
  });

  it("pre-fills No for a business with a TRN that is not registered, and saves false", async () => {
    const { updateBusiness } = await import("@/lib/api-client");
    const user = userEvent.setup();
    render(<EditBusinessButton business={business({ trn: "102458963", gctRegistered: false })} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(question()).toHaveValue("no");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateBusiness).toHaveBeenCalledWith("biz-1", expect.objectContaining({ gctRegistered: false }));
  });

  it("turns it on", async () => {
    const { updateBusiness } = await import("@/lib/api-client");
    const user = userEvent.setup();
    render(<EditBusinessButton business={business({ gctRegistered: false })} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.selectOptions(question(), "yes");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateBusiness).toHaveBeenCalledWith("biz-1", expect.objectContaining({ gctRegistered: true }));
  });

  it("turns it OFF again — the answer can be cleared, not only set", async () => {
    const { updateBusiness } = await import("@/lib/api-client");
    const user = userEvent.setup();
    render(<EditBusinessButton business={business({ gctRegistered: true })} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(question()).toHaveValue("yes");
    await user.selectOptions(question(), "no");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateBusiness).toHaveBeenCalledWith("biz-1", expect.objectContaining({ gctRegistered: false }));
  });
});
