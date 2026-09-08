import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest for the web app.
 *
 * Until recently there was no config at all: the suite ran because every tested
 * file happened to use relative imports. The moment a library under test used
 * the `@/` alias that Next resolves natively, the suite could not load it.
 *
 * JSX is handled by esbuild — see below.
 */
export default defineConfig({
  /**
   * JSX via esbuild rather than `@vitejs/plugin-react`.
   *
   * The plugin exists for Fast Refresh and HMR, neither of which means anything
   * in a test run — and its current major is ESM-only, which this config cannot
   * `require`. esbuild's automatic runtime compiles the components perfectly
   * well for rendering, with one less dependency to keep current.
   */
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    /**
     * Node by DEFAULT, jsdom per file.
     *
     * Component tests opt in with `// @vitest-environment jsdom` at the top of
     * the file. That keeps the ~390 pure-logic tests running at Node speed
     * rather than every one of them paying to construct a DOM it never touches,
     * and it makes a file's environment visible where the file is read instead
     * of buried in a glob here.
     */
    environment: "node",
    /**
     * NO custom `include`. The first version of this file listed
     * `{app,lib,components}/**` for tidiness and silently stopped running
     * `middleware.test.ts`, which sits at the app root — and the total went UP
     * by one because a file was added as another was dropped, so it looked
     * healthy. Vitest's default glob finds every test wherever it lives; a
     * narrower list is a promise to remember every future directory.
     */
    setupFiles: ["./test/setup-dom.ts"],
  },
});
