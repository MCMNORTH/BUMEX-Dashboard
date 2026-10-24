import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// ERP tests (npm run test:erp). Server modules run as they are: `server-only` is a guard for client bundles only.
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": fileURLToPath(new URL("./lib/erp/accounting/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
