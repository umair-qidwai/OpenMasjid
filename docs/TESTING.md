# Test OpenMasjid

## Verified baseline

Commit `efebf748ebfdc94e19da6759b09d8c1e4b98d5b4` passed GitHub JavaScript, iOS and Android CI. Local verification also passed 36 JavaScript unit tests and 26 production-browser tests (13 mobile, 13 desktop).

- iOS: 11 Swift tests, XcodeGen generation, unsigned iPhone 15 simulator build. https://github.com/umair-qidwai/OpenMasjid/actions/runs/37012297474
- Android: 15 domain tests and debug APK build. https://github.com/umair-qidwai/OpenMasjid/actions/runs/37012297278
- This does NOT mean the native UI has been launched on a simulator/device, signing tested, or store submission completed.
- GitHub App login/publishing has mocked automated tests, but live integration requires your GitHub App credentials and deployment.
- GitHub Pages deployment is not active: enable Pages before using its workflow. Local website testing does not require Pages.

## 1. Download

```sh
git clone https://github.com/umair-qidwai/OpenMasjid.git
cd OpenMasjid
```

If already cloned, run `git pull` in your checkout instead.

## 2. Website and admin

Install Node.js 24 LTS with npm, then from the repository root:

```sh
npm ci
npm run check
npm test
npm run build
npm run preview --workspace @openmasjid/web -- --host 127.0.0.1 --port 4321
```

Open:

- Website: http://127.0.0.1:4321/
- Admin: http://127.0.0.1:4321/admin/
- Shared public data: http://127.0.0.1:4321/data/v1/site.json

Check campus changes, prayer/iqamah/Jumuah times, events, announcements, and a narrow/mobile browser window. In admin, edit the fictional content, save a local draft, reload, export/import a backup, and try adding/removing an event and campus. Local drafts are browser-only and do not change the public website. Remote publishing is unavailable until the publisher is configured; an error there is expected, not a saved edit.

To change public demo content locally, edit `content/site.json`, stop preview with Ctrl+C, run `npm run build`, and restart the preview command. `npm run dev` is an alternative development server, but acceptance tests use the production build.

### Automated browser tests

Install Chromium/Chrome. The checked-in Playwright configuration uses `/usr/bin/chromium` by default; on another OS set `CHROMIUM_PATH` to the actual browser executable, for example on macOS:

```sh
export CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run build
npm run test:e2e -- --workers=1
```

Stop any manually started server on port 4321 first; Playwright starts production preview. Inspect failures/screenshots under ignored `test-results/`. The tests cover runtime data, campus persistence/filtering, editor CRUD, validated draft restore, backup/CSV errors, unavailable API, keyboard access, console errors, reduced motion and overflow.

## 3. iOS: Mac required

1. Install Xcode (15.4 or newer), launch it and complete initial setup. Install an iOS simulator runtime in Xcode Settings → Platforms/Components.
2. Install XcodeGen. With Homebrew and a current Xcode: `brew install xcodegen`. For the exact Xcode 15.4 CI setup, use XcodeGen 2.42.0 as installed in `.github/workflows/ios.yml`.
3. From the repository root:

```sh
cd apps/ios
swift test --package-path Core
xcodegen generate
open OpenMasjid.xcodeproj
```

4. In Xcode select the **OpenMasjid** scheme and an installed iPhone simulator, then click Run (⌘R).
5. Check the fictional demo, campus selection, prayer times, events, announcements and Settings. In Settings, enter an HTTPS website base to connect to published content. Do not enter `/data/v1/site.json`; the app appends it.

The exact CI build command, if the iPhone 15 simulator is installed:

```sh
xcodebuild -project OpenMasjid.xcodeproj -scheme OpenMasjid -sdk iphonesimulator -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' build CODE_SIGNING_ALLOWED=NO
```

For your iPhone: connect/trust it, enable Developer Mode when prompted, select the app target → Signing & Capabilities → your Team, use a unique bundle identifier, select your iPhone as destination, then Run. A personal Apple ID can support limited development testing; TestFlight/App Store distribution requires the appropriate Apple Developer membership and provisioning. No signing secrets are included.

## 4. Android: Android Studio

1. Install Android Studio and complete SDK setup. In SDK Manager install Android SDK Platform 35, build tools, and platform-tools.
2. Open `apps/android` as the project. Let Gradle sync. Set the Gradle JDK to Java 17 in Android Studio's Gradle settings; a JDK is NOT distributed in this repository.
3. In Device Manager create/start an API 35 emulator. Select the **app** run configuration and click Run.
4. Check prayer times, campuses, events, announcements and Settings. For live data enter your HTTPS website base, not the JSON endpoint.

Command-line alternative, with Java 17 and Android SDK configured (`JAVA_HOME` points to your own JDK; `ANDROID_HOME` to your SDK):

```sh
cd apps/android
./gradlew :domain:test :app:assembleDebug
./gradlew :app:installDebug
```

On Windows use `gradlew.bat` instead of `./gradlew`.

The debug APK is `apps/android/app/build/outputs/apk/debug/app-debug.apk` relative to the repository root. To test on a phone, enable Developer options → USB debugging, connect/authorize the computer, confirm `adb devices` lists it, then run `:app:installDebug` or select the phone in Android Studio and Run. Launch OpenMasjid from the phone's launcher. Release signing/Play Store publication are separate manual steps.

## 5. Connect all clients and test offline

Native release configurations require HTTPS, so do not enter your laptop's `http://localhost:4321` URL. Deploy the static site to an HTTPS host first. Verify `<website-base>/data/v1/site.json` returns the document, then configure the same website base in both apps.

Load data online, enable airplane mode, refresh, and check the last-good/stale indication. Change to a different website base while offline: cached content from the old mosque must not appear as data for the new one. Restore connectivity and refresh.

## 6. Enable real publishing

Follow `services/publisher/README.md` for GitHub App permissions, callback URL, installation, secrets, Worker deployment and same-origin `/api/*` routing. Never paste private keys/tokens into the frontend or commit them. Then sign in at `/admin/`, edit content, publish, verify the commit in `content/site.json`, wait for deployment, and refresh the website/apps. A successful commit is not the same as completed deployment.

GitHub Pages serves static files only; the publisher must run elsewhere. To deploy the static website with the included workflow, configure repository Settings → Pages → Source → GitHub Actions and ensure the build's Astro base matches the URL path (e.g. `/OpenMasjid/` for a project Pages URL). See `docs/HOSTING.md`. Do not assume the Pages workflow is green before enabling/configuring it.
