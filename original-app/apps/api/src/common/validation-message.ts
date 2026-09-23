import type { ZodIssue } from "zod";

/**
 * Turns Zod issues into a sentence a contractor can act on.
 *
 * ## Why this exists
 *
 * Every rejected request in the app answered with the literal string
 * `"Validation failed"`. The pipe generated the real reason — which field, and why
 * — and threw it into an `issues` array that **nothing under `apps/web` read**.
 *
 * It was worse than a missing message. `errorMessage()` prefers a non-empty server
 * message over its own fallback, on the reasoning that if the server said something
 * it is more specific than "Couldn't save — is the API running?". So this generic
 * string beat every carefully-written fallback in the web app. A contractor typing
 * `-10` into Discount got three words and no field named.
 *
 * Fixing it here rather than in the web client fixes every form at once: the client
 * already renders `body.message`, and `issues` stays on the response for anything
 * that wants to highlight a specific field later.
 *
 * ## What it does NOT try to do
 *
 * It does not reword Zod's own messages where they are already clear ("Invalid
 * email"), and it does not invent field labels from a translation table that would
 * drift from the DTOs. It humanises the path and adds a plain-English reason for the
 * handful of codes that produce jargon — a `too_big` on a string reads as "String
 * must contain at most 500 character(s)", which is a sentence about a String rather
 * than about what the person typed.
 */

/** `lineItems.0.description` becomes `Line items #1 description`. */
export function fieldLabel(path: readonly (string | number)[]): string {
  if (path.length === 0) return "This request";

  const parts: string[] = [];
  for (const segment of path) {
    if (typeof segment === "number") {
      // Attach the position to whatever it indexes, and count from 1 — a
      // contractor's third line is "#3", not "#2".
      const previous = parts.pop();
      parts.push(previous ? `${previous} #${segment + 1}` : `#${segment + 1}`);
      continue;
    }
    parts.push(humanise(segment));
  }
  // Sentence-case the whole label, lower-casing the trailing segments so
  // "Line items #1 Description" reads as "Line items #1 description".
  const [head, ...rest] = parts;
  return [head, ...rest.map((p) => p.toLowerCase())].join(" ");
}

/** `unitPriceCents` becomes `Unit price cents`; `trn` becomes `TRN`. */
function humanise(segment: string): string {
  const known: Record<string, string> = {
    trn: "TRN",
    gct: "GCT",
    gctRatePct: "GCT rate",
    gctTreatment: "GCT treatment",
    id: "ID",
  };
  if (known[segment]) return known[segment]!;

  const words = segment
    // camelCase boundary, and the digits in a name like `line1`.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    // "Cents" is an implementation detail; a contractor thinks in dollars.
    .replace(/\bcents\b/g, "")
    .replace(/\bpct\b/g, "percentage")
    .replace(/\s+/g, " ")
    .trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A plain reason for the codes whose default text is about types, not people. */
function reasonFor(issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" || issue.received === "null"
        ? "is required"
        : `must be ${article(String(issue.expected))}`;
    case "too_small": {
      const min = issue.minimum;
      if (issue.type === "string") return min === 1 ? "is required" : `needs at least ${min} characters`;
      return `must be ${issue.inclusive ? "at least" : "more than"} ${min}`;
    }
    case "too_big": {
      const max = issue.maximum;
      if (issue.type === "string") return `is too long (at most ${max} characters)`;
      return `must be ${issue.inclusive ? "at most" : "less than"} ${max}`;
    }
    case "invalid_string": {
      // Zod says "Invalid email", which the label then turns into "Email invalid
      // email". Naming the expectation reads as an instruction instead.
      const kind = typeof issue.validation === "string" ? issue.validation : "value";
      const named: Record<string, string> = {
        email: "must be a valid email address",
        url: "must be a valid web address",
        uuid: "must be a valid id",
        datetime: "must be a date",
      };
      return named[kind] ?? lowerFirst(issue.message);
    }
    case "invalid_enum_value": {
      // Capped: fourteen parishes inline is a wall, and a form with a dropdown
      // should not have produced this in the first place.
      const options = issue.options.map(String);
      const shown = options.slice(0, 6).join(", ");
      return options.length > 6
        ? `must be one of ${shown}, or ${options.length - 6} others`
        : `must be one of: ${shown}`;
    }
    case "not_finite":
      return "must be a number";
    default:
      // Zod's own text, which for `invalid_string` ("Invalid email") and custom
      // refinements is already the clearest thing available.
      return lowerFirst(issue.message);
  }
}

const article = (expected: string): string =>
  /^[aeiou]/i.test(expected) ? `an ${expected}` : `a ${expected}`;

/** Capitalised, so an authored refinement message reads as a sentence. */
const sentence = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * One sentence naming what was wrong, for a human.
 *
 * Capped at three issues: a wall of text is read as an error page rather than as
 * something to fix, and the first field is nearly always the one that matters.
 */
export function validationMessage(issues: readonly ZodIssue[]): string {
  if (issues.length === 0) return "Validation failed";

  const shown = issues.slice(0, 3).map((i) =>
    // A `custom` issue comes from a `.refine()` whose message was written by hand
    // for a person to read. Prefixing a derived label onto it duplicates the field
    // name — testing against the real DTOs produced "First name firstName (or
    // legacy name) is required", which is how this was caught.
    i.code === "custom" ? sentence(i.message) : `${fieldLabel(i.path)} ${reasonFor(i)}`,
  );
  const rest = issues.length - shown.length;
  const tail = rest > 0 ? `, and ${rest} other ${rest === 1 ? "field" : "fields"}` : "";
  return `${shown.join("; ")}${tail}.`;
}
