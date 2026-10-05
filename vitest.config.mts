import { defineConfig } from "vitest/config";

/**
 * Two kinds of tests:
 *
 * - `test/unit` covers the pure leave arithmetic in `srv/lib` without CAP.
 * - `test/integration` boots the app with `cds.test` against an in-memory
 *   database and calls the agent's tools the way the plugin does. The model is
 *   left out: `llm-mock` never calls a tool, so whether the model picks the
 *   right tool is checked in the hybrid profile against a real one.
 *
 * Integration files run one at a time (`fileParallelism: false`) because
 * `cds.test` boots a full server per file.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    setupFiles: ["test/setup/typescript.ts", "test/setup/silence-logs.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
