import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source-scanning guard, not a behaviour test.
 *
 * `emailSendingStatus` is unit-tested and correct, and the page dutifully
 * passed its reason down to every send button. `EmailInvoiceButton` then
 * DECLARED the prop and never read it — so the invoice email button stayed
 * live while the quote one was properly disabled, and a contractor could send
 * a client an email that would never be delivered.
 *
 * Nothing in the type system objects: an unused prop is legal. ESLint did warn
 * ("'unavailableReason' is defined but never used"), that warning was printed
 * in every single build, and it was never acted on — a warning among warnings
 * is not an invariant. So the rule is enforced where it can actually fail the
 * build.
 *
 * The rule: any component that ACCEPTS a send-blocking reason must also use it
 * to disable something. Accepting it and dropping it is the exact shape of the
 * bug — the gate looks wired from the caller's side.
 */
const REASON_PROPS = ["unavailableReason", "emailUnavailableReason"];

function tsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, found);
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

describe("send-blocking reasons are actually applied", () => {
  const files = tsxFiles(join(process.cwd(), "app"));

  it("finds the send buttons at all, so a rename cannot silently empty this test", () => {
    const accepting = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return REASON_PROPS.some((p) => src.includes(`${p}?:`));
    });
    expect(accepting.length).toBeGreaterThanOrEqual(3);
  });

  it.each(REASON_PROPS)("%s is used in a disabled= expression wherever it is accepted", (prop) => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!src.includes(`${prop}?:`)) continue;
      // The reason must reach a `disabled=` expression. Rendering it as text
      // is not enough — a visible explanation beside a button that still works
      // is worse than no explanation, because it reads as a warning the user
      // may ignore rather than a block.
      //
      // One hop of derivation counts: `const whyNoEmail = reason ?? …` then
      // `disabled={busy || Boolean(whyNoEmail)}` is a correct gate, and a rule
      // that rejected it would push authors to inline the expression rather
      // than name it. Two hops is beyond what a regex should pretend to know —
      // if a gate ever needs that, it wants a real test, not this guard.
      const names = [prop];
      for (const [, derived] of src.matchAll(
        new RegExp(`const (\\w+)\\s*=[^;]*\\b${prop}\\b`, "g"),
      )) {
        if (derived) names.push(derived);
      }
      const disablesOnIt = names.some((n) =>
        new RegExp(`disabled=\\{[^}]*\\b${n}\\b`).test(src),
      );
      if (!disablesOnIt) offenders.push(file.replace(process.cwd(), ""));
    }
    expect(offenders).toEqual([]);
  });
});
