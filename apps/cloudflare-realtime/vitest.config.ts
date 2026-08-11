import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        isolatedStorage: false,
        miniflare: {
          serviceBindings: {
            API: async () =>
              Response.json({ authorized: false }, { status: 401 }),
          },
        },
      },
    },
  },
});
