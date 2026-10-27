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
  // Every dropdown is Vanguard's (vanguard/ui/Select.tsx: Select, Suggest), with its search; vanguard/ui/test checks
  // the ERP team's files too, which this lint leaves out.
  {
    files: ["app/**/*.tsx", "components/**/*.tsx", "vanguard/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "JSXOpeningElement[name.name='select']", message: "Use <Select> from vanguard/ui/Select (the app's dropdown, with its search)." },
        { selector: "JSXOpeningElement[name.name='datalist']", message: "Use <Suggest> from vanguard/ui/Select (a free text field with suggestions)." },
      ],
    },
  },
]);

export default eslintConfig;
