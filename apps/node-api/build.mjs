import { build } from "esbuild";
await build({
  entryPoints: {
    server: "src/server.ts",
    migrate: "src/migrate.ts",
    "postgres-test": "test/postgres-test.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "bundle",
  external: ["pg", "pg-native"],
  sourcemap: true,
});
