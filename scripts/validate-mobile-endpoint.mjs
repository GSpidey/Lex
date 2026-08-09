const endpoint = process.env.EXPO_PUBLIC_API_URL;
const profile = process.env.EXPO_PUBLIC_APP_ENV;

if (profile !== "staging" && profile !== "production")
  throw new Error(
    "APK builds require EXPO_PUBLIC_APP_ENV=staging or production",
  );
if (!endpoint)
  throw new Error("EXPO_PUBLIC_API_URL is required for an installable APK");
const url = new URL(endpoint);
if (
  url.protocol !== "https:" ||
  !url.pathname.replace(/\/$/u, "").endsWith("/v1")
)
  throw new Error("APK API endpoint must use HTTPS and end in /v1");
const forbidden = ["localhost", "127.0.0.1", "10.0.2.2"];
if (forbidden.includes(url.hostname) || url.hostname.endsWith(".invalid"))
  throw new Error(`Unsafe APK API host: ${url.hostname}`);
const approved = new Set(
  (process.env.LEX_APPROVED_API_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
if (
  profile === "staging" &&
  !url.hostname.endsWith(".workers.dev") &&
  !approved.has(url.hostname)
)
  throw new Error(
    "Staging APK host must be a workers.dev address or explicitly approved",
  );
if (profile === "production" && !approved.has(url.hostname))
  throw new Error(
    "Production APK host must be explicitly approved through LEX_APPROVED_API_HOSTS",
  );
console.log(`Validated ${profile} API endpoint: ${url.origin}/v1`);
