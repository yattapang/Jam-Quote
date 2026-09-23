import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests that stand up an in-process Postgres are serialised for the same
    // reason db/ serialises them: parallel instances starved the previous
    // application's suite and produced a failure that moved between files.
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
