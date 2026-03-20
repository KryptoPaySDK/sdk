import { defineConfig } from "tsup";

export default defineConfig([
  // Vanilla entry: @kryptopay/sdk
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    outDir: "dist",
    platform: "browser",
    external: ["react", "react-dom"],
  },

  // React entry: @kryptopay/sdk/react
  {
    entry: ["src/react/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    outDir: "dist/react",
    external: ["react", "react-dom"],
  },
]);
