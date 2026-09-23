import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { createClientSchema } from "../clients/clients.dto.js";
import { createQuoteSchema } from "../quotes/quotes.dto.js";
import { createProjectSchema } from "../projects/projects.dto.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";
import { fieldLabel, validationMessage } from "./validation-message.js";

/**
 * What a contractor reads when the server refuses their form.
 *
 * Every rejection used to answer with the literal string `"Validation failed"`. The
 * reason was computed and thrown into an `issues` array that nothing in the web app
 * read — and because `errorMessage()` prefers a non-empty server message over its
 * own fallback, that generic string beat every carefully-written message in the
 * client. Typing `-10` into Discount got three words and no field named.
 *
 * These tests go through the REAL DTOs and the REAL pipe, because the thing worth
 * asserting is the sentence a person sees, not that a helper formats a synthetic
 * issue. A message that reads well against a hand-made Zod error and badly against
 * `createQuoteSchema` would have passed a unit test and failed the contractor.
 */

function messageFor(schema: Parameters<typeof pipeFor>[0], value: unknown): string {
  try {
    pipeFor(schema).transform(value);
    throw new Error("expected the payload to be rejected");
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    return (err.getResponse() as { message: string }).message;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pipeFor = (schema: any) => new ZodValidationPipe(schema);

describe("the message a rejected form comes back with", () => {
  it("names the missing field instead of saying Validation failed", () => {
    const message = messageFor(createClientSchema, {});
    expect(message).not.toContain("Validation failed");
    expect(message).toMatch(/First name is required/i);
  });

  it("names a bad email as an email problem", () => {
    const message = messageFor(createClientSchema, {
      firstName: "Marcia",
      lastName: "Brown",
      email: "marcia at example",
    });
    expect(message).toMatch(/email/i);
  });

  it("says which line of a quote is wrong, counting from 1", () => {
    // The case the finding was reported against: a nested failure deep in an array.
    // "lineItems.1.description" is not something to put in front of a contractor.
    const message = messageFor(createQuoteSchema, {
      sections: [],
      lineItems: [
        {
          category: "MATERIAL",
          description: "Cement",
          quantity: 1,
          rateUnit: "UNIT",
          unitPriceCents: 1000,
          gctTreatment: "STANDARD",
        },
        {
          category: "MATERIAL",
          description: "",
          quantity: 1,
          rateUnit: "UNIT",
          unitPriceCents: 1000,
          gctTreatment: "STANDARD",
        },
      ],
    });
    expect(message).toMatch(/#2/);
    expect(message).toMatch(/description/i);
  });

  it("gives a number bound in the units the person typed", () => {
    const message = messageFor(createProjectSchema, {
      name: "Retaining wall",
      progressPct: 150,
    });
    expect(message).toMatch(/Progress percentage must be at most 100/i);
  });

  it("names the allowed values for a bad enum", () => {
    const message = messageFor(createProjectSchema, {
      name: "Retaining wall",
      stage: "MAYBE_LATER",
    });
    expect(message).toMatch(/must be one of/i);
    expect(message).toMatch(/ENQUIRY|WON/);
  });

  it("keeps the issues array, so a screen can highlight a field later", () => {
    try {
      pipeFor(createClientSchema).transform({});
      throw new Error("expected a rejection");
    } catch (err) {
      const body = (err as BadRequestException).getResponse() as {
        message: string;
        issues: unknown[];
      };
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues.length).toBeGreaterThan(0);
    }
  });

  it("does not become a wall of text when everything is wrong", () => {
    // An empty body fails every required field. Three named, then a count: a wall
    // reads as an error page rather than as something to fix.
    const message = messageFor(createQuoteSchema, { lineItems: [{}] });
    expect(message.split(";").length).toBeLessThanOrEqual(3);
    expect(message).toMatch(/other fields?\.$|\.$/);
  });
});

describe("fieldLabel", () => {
  it("humanises a camelCase path", () => {
    expect(fieldLabel(["unitPriceCents"])).toBe("Unit price");
  });

  it("drops `cents`, because a contractor thinks in dollars", () => {
    // The stored unit is an implementation detail. "Unit price cents must be at
    // least 0" invites the question "cents?".
    expect(fieldLabel(["depositCents"])).toBe("Deposit");
  });

  it("expands `pct` rather than leaving jargon", () => {
    expect(fieldLabel(["retentionPct"])).toBe("Retention percentage");
  });

  it("keeps initialisms as initialisms", () => {
    expect(fieldLabel(["trn"])).toBe("TRN");
    expect(fieldLabel(["gctRatePct"])).toBe("GCT rate");
  });

  it("counts array positions from 1 and attaches them to what they index", () => {
    expect(fieldLabel(["lineItems", 0, "description"])).toBe("Line items #1 description");
    expect(fieldLabel(["sections", 2, "lineItems", 0, "quantity"])).toBe(
      "Sections #3 line items #1 quantity",
    );
  });

  it("says something rather than nothing for a whole-body failure", () => {
    expect(fieldLabel([])).toBe("This request");
  });
});

describe("validationMessage", () => {
  it("falls back to the old string only when there are no issues at all", () => {
    // Not reachable through the pipe — Zod does not fail with an empty issue list —
    // but the fallback should be honest rather than an empty sentence.
    expect(validationMessage([])).toBe("Validation failed");
  });
});
