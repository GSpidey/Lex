import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

const migrations = await readD1Migrations("./migrations");

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        isolatedStorage: false,
        miniflare: {
          bindings: {
            AUTH_HMAC_PEPPER: "local-test-hmac-pepper-at-least-32-characters",
            FIELD_ENCRYPTION_KEY:
              "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
            DEV_OTP_ECHO: "false",
            APP_ENV: "staging",
            STAGING_TEST_LOGIN_ENABLED: "true",
            STAGING_TEST_PHONE_E164: "+2348000000001",
            STAGING_TEST_OTP_CODE: "246810",
            OPENAI_PROVIDER_STATUS: "configured_unverified",
            FOUNDER_BOOTSTRAP_TOKEN:
              "local-founder-bootstrap-token-at-least-32-characters",
            TEST_MODE: "true",
            FOUNDER_BOOTSTRAP_TEST_TOKEN:
              "local-founder-bootstrap-test-token-at-least-32-characters",
            TEST_MIGRATIONS: migrations,
          },
        },
      },
    },
  },
});
