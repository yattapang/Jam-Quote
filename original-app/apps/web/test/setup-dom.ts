import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// Registers the DOM matchers the component tests read with - toBeDisabled,
// toBeInTheDocument, toHaveValue. Without these, `expect(button).toBeDisabled()`
// fails as "not a function", which looks like a broken component rather than a
// missing import.
import "@testing-library/jest-dom/vitest";

/**
 * Shared setup for every test file, DOM or not.
 *
 * `cleanup` unmounts anything a component test rendered. Without it, React
 * leaves each render in the document and the next test's `getByLabelText`
 * finds two matching fields and throws — a failure that reads as "the component
 * is broken" when the previous test simply never tidied up.
 *
 * It is a no-op in the Node environment, so this file is safe for the
 * pure-logic suites that make up most of the tests here.
 */
afterEach(() => {
  cleanup();
});
