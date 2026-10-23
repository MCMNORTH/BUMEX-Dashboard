import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The ERP team's engine and schema tests, kept as delivered so their updates diff cleanly (see db/erp/README.md).
    "lib/erp/engine/**",
    "db/erp/test/guarantees.test.mjs",
  ]),
]);

export default eslintConfig;
