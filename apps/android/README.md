# OpenMasjid Android

Native Kotlin + Jetpack Compose Material 3 client for a published OpenMasjid site. The app uses only native Android controls (no WebView), strict `kotlinx.serialization` decoding, and the contract in `../../docs/CONTRACT.md`.

## Build and test

From this directory:

```bash
# Set JAVA_HOME to your installed Java 17 JDK; configure Android SDK in Android Studio.
./gradlew test
./gradlew :domain:test
./gradlew :app:assembleDebug       # requires Android SDK + platform 35
./gradlew :app:installDebug        # requires an attached emulator/device
```

No JDK is bundled in Git. Set `JAVA_HOME` to your local Java 17 installation. Gradle wrapper and plugin versions are pinned in the existing scaffold. Settings stores a website base such as `https://example.org`; the repository appends `/data/v1/site.json` exactly.

## Data and offline behavior

Settings accepts an HTTPS published site URL; the client reads `data/v1/site.json` at that URL. The bundled default is a safe fictional demo endpoint and the bundled demo JSON is not live mosque data. A successful response is cached as the last-good document. Network failures show the cached document with an offline/stale indicator; with no cache, the app shows an explicit error and retry action. Unknown JSON fields, invalid dates/times/timezones, unsafe links, invalid colors, bad IDs, broken timestamps, and invalid campus references are rejected.

Campus selection is persisted. Prayer tables use the campus timezone and local date; explicit daily iqamah overrides take precedence over the campus fixed schedule. Events and announcements include campus-specific and global entries. Detail dialogs render plain text only. External website/contact links must be HTTPS or Android `tel:`/`mailto:` intents; map/contact actions must be added only with validated values from the document.

## Signing and store release (manual, no secrets in this repository)

1. Create a keystore locally: `keytool -genkeypair -keystore openmasjid-upload.jks -alias openmasjid -keyalg RSA -keysize 2048 -validity 10000`.
2. Keep the keystore and passwords outside Git (password manager or CI secret store). Never put them in `gradle.properties`, source, or this README.
3. Add a local or CI-only `signingConfigs` block to `app/build.gradle.kts`, mapping values from environment/secret storage.
4. Run `./gradlew :app:bundleRelease`, inspect the AAB, and upload it manually through Google Play Console.
5. Configure Play signing, store listing, privacy/data-safety declarations, screenshots, content rating, and tester tracks in Play Console. Rotate/upload keys according to Google's documented recovery process.
