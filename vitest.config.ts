import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "~": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    // Server tests build their own temp database; this just keeps `~/env` from complaining.
    env: { SKIP_ENV_VALIDATION: "1", DATABASE_URL: "file::memory:" },
  },
});
