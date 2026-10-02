# Browser verification

Scope: `apps/web/`, `tests/web/`, `tests/e2e/`, `playwright.config.ts`, and this document. Browser checks run against the built static Astro output with system Chromium at `/usr/bin/chromium` (override with `CHROMIUM_PATH`). Do not use the Astro dev server for acceptance; the production build must be completed first.

## Web setup and verification

From the repository root, with the existing npm dependencies:

```sh
npm run check
npm test
npm run build
npm run test:e2e -- --project=mobile --workers=1 --timeout=120000
npm run test:e2e -- --project=desktop --workers=1 --timeout=120000
```

`npm run build` publishes `content/site.json` to `apps/web/public/data/v1/site.json` and builds static pages. Playwright starts `npm run preview --workspace @openmasjid/web -- --host 127.0.0.1 --port 4321`; if a preview is started manually, restart it after every build so it serves the current `dist/`. The browser is real Chromium at `/usr/bin/chromium` by default, not a DOM-only substitute. No npm install, browser download, commit, or push is required.

Latest production-preview verification: 13 mobile tests passed at 360×800 and 13 desktop tests passed at 1440×1000, each with one worker. `test-results/public-home-mobile-360.png` and `/tmp/openmasjid-public-home-desktop-1440.png` are the inspected screenshots. The prior timed-out run is not counted.

Coverage includes the published JSON endpoint, runtime campus selection and URL/localStorage state, campus-scoped events and announcements, optional filter tabs, prayer/Jumuah content, 360px mobile and 1440px desktop layouts, reduced motion, overflow, console exceptions, admin CRUD, validated local-draft persistence, JSON export/import, CSV validation, unavailable publisher handling, and keyboard access. Screenshots and traces are written to ignored `test-results/`; the HTML report is `playwright-report/`.

## Native setup and verification status

### iOS simulator and physical device (macOS/Xcode only)

The commands below are copied from `apps/ios/README.md` and are not executable in this Linux checkout:

```sh
cd apps/ios
swift test --package-path Core
xcodegen generate
xcodebuild -project OpenMasjid.xcodeproj -scheme OpenMasjid -sdk iphonesimulator -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' build CODE_SIGNING_ALLOWED=NO
```

For a local simulator run, open the generated project in Xcode, select an iPhone Simulator, and Run. For a physical device, connect and trust the device, select the OpenMasjid target, set an Apple Developer Team and unique bundle identifier under Signing & Capabilities, then Run with a development certificate/profile. Archive and App Store distribution require the signing and App Store Connect steps in the native README. Xcode, iOS SDK, simulator, Swift toolchain, signing, simulator execution, and physical-device execution are unverified here because this host is Linux.

### Android emulator and physical device

The commands below are copied from `apps/android/README.md`:

```sh
cd apps/android
export JAVA_HOME="$PWD/.tooling/zulu17.68.203-ca-crac-jdk17.0.20.1-linux_aarch64"
./gradlew test
./gradlew :domain:test
./gradlew :app:assembleDebug
./gradlew :app:installDebug
```

For a local emulator, install Android SDK/platform 35, create/start an API 35 emulator in Android Studio or with the SDK tools, then run `./gradlew :app:installDebug`; launch OpenMasjid from the emulator. For a physical device, enable developer options and USB debugging, connect and authorize the device, confirm it with `adb devices`, then run `./gradlew :app:installDebug`. The bundled JDK is Linux ARM64; other architectures need a local Java 17 installation. Android compilation, emulator execution, physical-device installation, signing, and store upload are unverified in this session unless separately reported from a real run.

The native apps use the published base URL and request `data/v1/site.json`; they are not WebViews. Release signing must remain local/CI-only and secrets must not be committed.
