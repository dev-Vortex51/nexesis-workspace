import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // DB-gated integration suites seed several users through Better Auth
    // (bcrypt) in beforeAll; under parallel execution these can exceed the
    // default 10s hook timeout. Raise the hook/test ceilings so the suites
    // stay reliable as more integration files run concurrently.
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
