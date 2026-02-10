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

  // Server entry: @kryptopay/sdk/server
  {
    entry: ["src/server/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    outDir: "dist/server",
    platform: "node",
  },
]);
