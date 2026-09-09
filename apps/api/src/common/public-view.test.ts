import { InternalServerErrorException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { publicQuoteWire } from "@jamquote/core";
import { assertPublicShape } from "./public-view.js";

/**
 * The public share response is checked against its contract on the way out.
 *
 * `TESTING.md` claimed the markup-disclosure fix was "guarded twice" — by the
 * explicit `PUBLIC_LINE_SELECT` and by a `.strict()` wire contract. An
 * independent review found the second guard inert: `publicQuoteWire.parse`
 * appeared only inside test files, against a hand-written sample, while the
 * service assigned `business` and `lineItems` from a Prisma result. Excess-
 * property checking applies only to fresh object literals, so a wider payload
 * compiled.
 *
 * The source-scanning disclosure test DOES pin `PUBLIC_LINE_SELECT`, and that is
 * what keeps the markup out. What it never looked at was the `client`, `business`
 * and `sections` selects — so a client's TRN or a business phone number could be
 * added and everything still passed.
 *
 * These tests are written against the fields that guard could not see.
 */

/** A valid response, in the shape the wire sees it: dates and Decimals as strings. */
function validView() {
  return {
    number: "Q-0007",
    status: "SENT",
    validUntil: "2026-10-01T00:00:00.000Z",
    terms: "50% deposit",
    detailLevel: "SUMMARY",
    gctRate: "15",
    discountPct: "0",
    depositCents: 0,
    subtotalCents: 100_000,
    gctCents: 15_000,
    totalCents: 115_000,
    lineItems: [
      {
        id: "li_1",
        category: "MATERIAL",
        description: "Cement",
        quantity: "10",
        rateUnit: "UNIT",
        unitLabel: null,
        unitPriceCents: 10_000,
        gctTreatment: "STANDARD",
      },
    ],
    sections: [],
    clientName: "Marcia Brown",
    business: {
      name: "Blackwood Construction",
      addressLine: "1 Hope Road",
      town: "Kingston",
      parish: "St Andrew",
      trn: "123-456-789",
    },
  };
}

describe("assertPublicShape", () => {
  it("passes a response that matches the contract, and returns it unchanged", () => {
    const view = validView();
    expect(assertPublicShape(publicQuoteWire, view, "PublicQuoteView")).toBe(view);
  });

  it("REFUSES the contractor's markup on a line", () => {
    // The original leak. Pinned by the source-scanning guard too; pinned here
    // as well because that guard reads one block of one file.
    const view = validView();
    view.lineItems[0] = { ...view.lineItems[0]!, markupPct: "20" } as never;
    expect(() => assertPublicShape(publicQuoteWire, view, "PublicQuoteView")).toThrow(
      InternalServerErrorException,
    );
  });

  it("REFUSES a client TRN added to the client select", () => {
    // A field the disclosure guard cannot see: it parses PUBLIC_LINE_SELECT only.
    // Before this, adding `trn: true` to the client select compiled and passed.
    const view = { ...validView(), clientTrn: "099-888-777" };
    expect(() => assertPublicShape(publicQuoteWire, view, "PublicQuoteView")).toThrow(
      InternalServerErrorException,
    );
  });

  it("REFUSES a phone number added to the business letterhead", () => {
    const view = validView();
    view.business = { ...view.business, phone: "876-555-0000" } as never;
    expect(() => assertPublicShape(publicQuoteWire, view, "PublicQuoteView")).toThrow(
      InternalServerErrorException,
    );
  });

  it("REFUSES an extra field on a section", () => {
    const view = validView();
    view.sections = [{ title: "Groundworks", lineItems: [], internalNote: "chase deposit" }] as never;
    expect(() => assertPublicShape(publicQuoteWire, view, "PublicQuoteView")).toThrow(
      InternalServerErrorException,
    );
  });

  it("REFUSES a new top-level field, even one that looks harmless", () => {
    // `id` is not harmless: it is the tenant's primary key, and the public view
    // deliberately carries none.
    const view = { ...validView(), id: "qt_1" };
    expect(() => assertPublicShape(publicQuoteWire, view, "PublicQuoteView")).toThrow(
      InternalServerErrorException,
    );
  });

  it("fails CLOSED, and its message names nothing", () => {
    // A 500 on a share link is a bug someone fixes in an hour. A silently widened
    // payload is a disclosure nobody notices. The message must not repeat the
    // field that should not have been sent — that detail goes to the log.
    const view = { ...validView(), markupPct: "20" };
    try {
      assertPublicShape(publicQuoteWire, view, "PublicQuoteView");
      throw new Error("should have refused");
    } catch (err) {
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect((err as Error).message).toBe("This link is temporarily unavailable");
      expect((err as Error).message).not.toContain("markup");
    }
  });

  it("also refuses a response MISSING a promised field", () => {
    // The other direction: the client page renders `totalCents`, so sending a
    // response without it would render a blank total rather than fail.
    const { totalCents: _dropped, ...without } = validView();
    expect(() => assertPublicShape(publicQuoteWire, without, "PublicQuoteView")).toThrow(
      InternalServerErrorException,
    );
  });
});
