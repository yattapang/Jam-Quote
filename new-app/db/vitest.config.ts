import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file spins up its own in-process Postgres. Running them in
    // parallel on a small CI box starved the previous application's suite and
    // produced a moving victim, so these are serialised on purpose: a slower
    // honest suite beats a fast flaky one.
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
