import type { ConfigContext, ExpoConfig } from "expo/config";
import base from "./app.json";

const STAGING_BUNDLE_ID = "com.lexnigeria.test";
const baseConfig = base.expo as ExpoConfig;

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE ?? "internal";
  const releaseBuild = profile === "testflight" || profile === "production";
  const bundleIdentifier = releaseBuild
    ? process.env.LEX_IOS_BUNDLE_IDENTIFIER
    : STAGING_BUNDLE_ID;
  if (releaseBuild && !bundleIdentifier)
    throw new Error(
      "LEX_IOS_BUNDLE_IDENTIFIER is required for TestFlight or production builds",
    );
  return {
    ...config,
    ...baseConfig,
    version: "0.3.0",
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: bundleIdentifier ?? STAGING_BUNDLE_ID,
      buildNumber: "3",
      associatedDomains: process.env.LEX_IOS_ASSOCIATED_DOMAIN
        ? [`applinks:${process.env.LEX_IOS_ASSOCIATED_DOMAIN}`]
        : [],
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType:
              "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
          {
            NSPrivacyAccessedAPIType:
              "NSPrivacyAccessedAPICategoryFileTimestamp",
            NSPrivacyAccessedAPITypeReasons: ["C617.1"],
          },
        ],
      },
    },
    android: {
      ...baseConfig.android,
      versionCode: 3,
    },
    extra: {
      ...baseConfig.extra,
      buildProfile: profile,
      legalReviewStatus: "pending-partner-review",
    },
  };
};
