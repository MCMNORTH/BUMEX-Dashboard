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
    // The ERP team's engine, interface (vanguard/) and schema tests, kept as delivered so their updates diff cleanly.
    "lib/erp/engine/**",
    "vanguard/*.ts",
    "vanguard/*.tsx",
    "vanguard/three/**",
    "vanguard/ui/**",
    // (vanguard/one/ is ours: BUMEX One's features rebuilt in Vanguard)
    "db/erp/test/guarantees.test.mjs",
  ]),
]);

export default eslintConfig;
