import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest for the web app.
 *
 * Until now there was no config at all: the suite ran because every tested file
 * happened to use relative imports. The moment a library under test used the
 * `@/` alias that Next resolves natively, the suite could not load it — which
 * is how `error-message.ts` failed to import `api-client`.
 *
 * So the alias is declared here to match `tsconfig.json`. Without it, whether a
 * module is testable depends on which import style its author happened to pick,
 * which is not a rule anyone can follow.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Node by default. Component tests opt into jsdom per file with
    // `// @vitest-environment jsdom`, so the ~380 pure-logic tests keep running
    // at Node speed rather than paying for a DOM none of them touch.
    environment: "node",
    // NO custom `include`. The first version of this file listed
    // `{app,lib,components}/**` for tidiness and silently stopped running
    // `middleware.test.ts`, which sits at the app root — the test count went
    // UP by one when a file had been added and another dropped, so it looked
    // fine. Vitest's default glob finds every test wherever it lives, and a
    // narrower list is a promise to remember every future directory.
  },
});
