import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    // Each file gets its own in-memory mongod; running them serially keeps
    // memory sane and avoids port churn.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      // Overridden per-run by the in-memory server in tests/setup.js; present
      // only so config/env.js validation passes at import time.
      MONGODB_URI: "mongodb://127.0.0.1:27017/saydle-test",
      JWT_ACCESS_SECRET: "test-access-secret-that-is-long-enough-000000",
      JWT_REFRESH_SECRET: "test-refresh-secret-that-is-long-enough-00000",
      LOG_LEVEL: "silent",
      // Tests never call Vertex for real. The generation path is covered by
      // mocking vertex.service.js; everything else runs on the curated bank.
      AI_ENABLED: "false",
    },
  },
});
