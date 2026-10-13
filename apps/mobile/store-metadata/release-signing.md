# Lex signing and publisher preparation

No upload, store submission, Apple membership conversion, or production activation is performed by these instructions.

## Android

Internal APKs retain the existing com.lexnigeria.test identity and internal debug certificate so existing test installations are not needlessly broken. They are not production artifacts.

Store bundles and any build with EXPO_PUBLIC_APP_ENV=production require LEX_ANDROID_RELEASE_MODE=store. Supply LEX_ANDROID_APPLICATION_ID, LEX_ANDROID_KEYSTORE_PATH, LEX_ANDROID_STORE_PASSWORD, LEX_ANDROID_KEY_ALIAS and LEX_ANDROID_KEY_PASSWORD using protected environment/secret injection. The Gradle configuration rejects the staging package, default debug alias and debug.keystore in store mode. No private upload key has been generated, selected or committed. Confirm the app's final identity and applicable existing Play signing arrangement before doing so.

Before upload, inspect the actual AAB/APK signature and manifest, verify version monotonicity, run the production endpoint/content checks, and install/test the signed artifact where applicable. Build success alone is not device acceptance.

## Apple

The owner account was observed as an Individual membership during preparation. Proposed publisher: GoldenEpic Solutions Inc., corporation 1641963-1, incorporated 24 October 2024. D-U-N-S 24-480-1676 was supplied by the owner; the D&B incorporation-date discrepancy needs correction. Registered corporate contact details and the owner's legal authority must satisfy Apple's verification.

Before requesting conversion, review effects on the account's other apps, agreements, seller identity, team access and banking/tax records with the owner. Do not inspect unrelated app repositories or submit the request automatically. Confirm Lex publishing rights and actual service responsibilities; an intercompany agreement alone does not guarantee store eligibility.

Existing EAS internal, TestFlight and production profiles are retained. Confirm bundle identifier, Apple team, App Store Connect app ID, permissions, privacy labels, support/privacy/deletion URLs, reviewer access and encryption determination before enabling a signed build or submission. No automatic submit action is configured.

## Payment policy assessment

Review the initial consultation, retained text/written assessment and each representation invoice separately against both stores' rules. Do not assume that every legal-service payment qualifies for a one-to-one-service exemption. Preserve these product features while resolving the correct payment treatment with the relevant store and legal reviewers.

References: [Android signing](https://developer.android.com/studio/publish/app-signing), [Apple membership changes](https://developer.apple.com/help/account/membership/updating-your-account-information/), [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google payment guidance](https://support.google.com/googleplay/android-developer/answer/10281818).
