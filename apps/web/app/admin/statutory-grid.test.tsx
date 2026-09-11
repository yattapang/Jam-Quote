// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminConsole from "./AdminConsole";
import type { AdminData, EffectiveRulePack } from "@/lib/api-client";

/**
 * How many rate inputs one statutory contribution gets.
 *
 * ## Why this file exists, and why it is not a unit test
 *
 * The defect: an admin-added levy appeared BOTH in the statutory rate grid and in
 * its own row under MAINTAIN CONTRIBUTIONS. Two inputs for one number, and the
 * grid's untouched copy won the merge — editing the levy's own rate reported
 * "Saved ✓" and changed nothing, leaving two different figures on screen.
 *
 * The decision behind the grid is `gridContributionCodes`, which has unit tests. A
 * review pointed out that those prove the FUNCTION is right and say nothing about
 * whether the screen uses it — and that I had deleted the source assertion which
 * held that, citing a render test by this exact filename that I had never written.
 * That was the worst kind of comment: a claim of coverage that did not exist.
 *
 * So this renders the console and counts inputs. It is the only test here that can
 * fail if the console stops calling the function.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

// The console imports many writers; none is called by a render.
vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    getAdminPricing: vi.fn().mockResolvedValue({
      freeQuotesPerMonth: 5,
      proMonthlyPriceCents: 250_000,
      proAnnualPriceCents: 2_500_000,
      currency: "JMD",
    }),
  };
});

const BASELINE = ["NIS", "NHT", "EDUCATION_TAX", "HEART"];

function rulepack(overrides: Partial<EffectiveRulePack> = {}): EffectiveRulePack {
  return {
    countryCode: "JM",
    countryName: "Jamaica",
    currencyCode: "JMD",
    taxLabel: "GCT",
    taxLongName: "General Consumption Tax",
    defaultTaxRatePct: 15,
    taxpayerIdLabel: "TRN",
    regionLabel: "Parish",
    regions: ["Kingston"],
    paymentProviders: [],
    statutory: BASELINE.map((code) => ({
      code,
      label: code,
      appliesTo: "BOTH",
      employeePct: 3,
      employerPct: 3,
      verified: false,
      asOf: null,
    })),
    verifiedAsOf: null,
    sourceUrl: null,
    sources: [],
    rulePackVersion: "jm-test",
    overrideReadFailed: false,
    statutoryRetired: [],
    statutoryCustom: [],
    overridden: false,
    updatedAt: null,
    ...overrides,
  };
}

function data(pack: EffectiveRulePack | null): AdminData {
  return {
    overview: null,
    tenants: [],
    regulatory: [],
    financials: null,
    audit: [],
    // Every capability, so the editor renders at all.
    me: {
      userId: "u1",
      email: "staff@example.com",
      isSuperAdmin: true,
      capabilities: ["MANAGE_TENANTS", "MANAGE_RULEPACK", "MANAGE_PRICING", "VIEW_FINANCIALS", "MANAGE_ADMINS"],
    } as AdminData["me"],
    admins: [],
    rulepack: pack,
    failed: [],
  } as unknown as AdminData;
}

/** Renders the console and navigates to the rule-pack screen, as a staffer does. */
async function openRulePack(pack: EffectiveRulePack | null) {
  renderConsole(pack);
  await userEvent.click(await screen.findByRole("button", { name: /rule-pack verify/i }));
  await screen.findByText(/Edit jurisdiction values/i);
}

function renderConsole(pack: EffectiveRulePack | null) {
  return render(
    <AdminConsole
      data={data(pack)}
      admin={{ name: "Staff", email: "staff@example.com" }}
      apiEnv={{ label: "LOCAL", tone: "muted", detail: "localhost:3001" }}
    />,
  );
}

/** Rate inputs the grid offers for one code, found by their accessible label. */
function gridInputsFor(code: string): HTMLElement[] {
  // The grid's rows are labelled by code; each row has an employee and an employer
  // input. Counting by `aria-label` rather than by position, so a reordering of the
  // grid does not quietly change what this measures.
  return screen.queryAllByLabelText(new RegExp(`^${code} (employee|employer)`, "i"));
}

describe("the statutory rate grid", () => {
  it("offers exactly two inputs for a baseline contribution", async () => {
    await openRulePack(rulepack());
    // Employee and employer. The grid is the editor for a baseline contribution.
    expect(gridInputsFor("NIS")).toHaveLength(2);
  });

  it("offers NONE for a levy a custom entry has taken over", async () => {
    // The defect, as a user meets it. `NIS` is a baseline code AND claimed by a
    // custom entry, which `mergeStatutory` consumes in place — so it is still in the
    // effective list. Rendering the effective list, or filtering only by baseline
    // membership, both left this input on screen beside the custom row.
    await openRulePack(
      rulepack({
        statutoryCustom: [
          {
            code: "NIS",
            label: "NIS (revised)",
            appliesTo: "BOTH",
            employeePct: 7,
            employerPct: 7,
          },
        ],
        overridden: true,
      }),
    );
    expect(gridInputsFor("NIS")).toHaveLength(0);
    // The contributions nobody replaced keep theirs, so this did not pass by
    // rendering an empty grid.
    expect(gridInputsFor("NHT")).toHaveLength(2);
  });

  it("offers none for a levy the admin added, which is new to the jurisdiction", async () => {
    await openRulePack(
      rulepack({
        statutory: [
          ...rulepack().statutory,
          {
            code: "CESS",
            label: "Parish cess",
            appliesTo: "BOTH",
            employeePct: 1,
            employerPct: 1,
            verified: true,
            asOf: null,
          },
        ],
        statutoryCustom: [{ code: "CESS", label: "Parish cess", appliesTo: "BOTH", employeePct: 1 }],
        overridden: true,
      }),
    );
    expect(gridInputsFor("CESS")).toHaveLength(0);
  });
});
