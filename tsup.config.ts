import { defineConfig } from "tsup";

// Two entries built separately so the shebang banner lands only on the CLI
// binary (dist/cli.js) and not on the library entry (dist/index.js).
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    clean: true,
    target: "es2022",
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
    target: "es2022",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
