import { access, readFile } from "node:fs/promises";
import path from "node:path";

const requiredEnvironment = [
  "LEX_IOS_BUNDLE_IDENTIFIER",
  "LEX_APPLE_TEAM_ID",
  "LEX_ASC_APP_ID",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_REALTIME_URL",
  "LEX_SUPPORT_URL",
  "LEX_PRIVACY_URL",
];
const missing = requiredEnvironment.filter(
  (name) => !process.env[name]?.trim(),
);
if (missing.length > 0)
  throw new Error(`Missing iOS release configuration: ${missing.join(", ")}`);

for (const name of [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_REALTIME_URL",
  "LEX_SUPPORT_URL",
  "LEX_PRIVACY_URL",
]) {
  const value = process.env[name];
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname.endsWith(".invalid"))
    throw new Error(`${name} must be an approved HTTPS URL`);
}

if (process.env.LEX_IOS_BUNDLE_IDENTIFIER === "com.lexnigeria.test")
  throw new Error(
    "The internal staging bundle identifier cannot be submitted to TestFlight",
  );

const metadataRoot = path.resolve("store-metadata/ios");
for (const file of [
  "beta-description.md",
  "review-notes.md",
  "privacy-labels.md",
  "export-compliance.md",
  "reviewer-checklist.md",
]) {
  await access(path.join(metadataRoot, file));
  const contents = await readFile(path.join(metadataRoot, file), "utf8");
  if (contents.includes("[REQUIRED_BEFORE_UPLOAD]"))
    throw new Error(`${file} still contains release-blocking placeholders`);
}
console.log(
  "iOS release metadata and identifiers are complete enough to start a TestFlight build.",
);
