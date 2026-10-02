# OpenMasjid iOS

Native SwiftUI iOS 17+ client for the OpenMasjid v1 site contract. The bundled JSON is explicitly fictional demo content and is used as the first-run preview. The app never uses a WebView or embeds secrets.

## Structure

- `Core/` — Swift Package Foundation models, strict Codable validation, filtering/date helpers, HTTPS loader/cache, and XCTest tests.
- `OpenMasjidApp/` — SwiftUI app with native tabs, campus selection, prayer/iqamah/Jumuah presentation, events, announcement detail, safe contact/maps links, settings, theming, and stale/offline state.
- `project.yml` — XcodeGen project definition.

## Build and test (macOS with Xcode 15+)

From this directory:

```sh
swift test --package-path Core
xcodegen generate
xcodebuild -project OpenMasjid.xcodeproj -scheme OpenMasjid -sdk iphonesimulator -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' build CODE_SIGNING_ALLOWED=NO
```

The deployed website base is configured in the app's Settings screen. It must be an HTTPS origin; the app requests `data/v1/site.json`, validates the complete strict schema, caches only the last valid response, and reports loading/error/stale states.

## Signing and App Store submission

1. Open `OpenMasjid.xcodeproj` in Xcode on macOS.
2. Select the OpenMasjid target, set your Apple Developer Team and a unique Bundle Identifier under Signing & Capabilities, and let Xcode manage or select the appropriate iOS Development signing certificate and provisioning profile.
3. Select a real device or **Any iOS Device (arm64)**, choose Product → Archive, then in Organizer choose Validate App and Distribute App → App Store Connect. Complete the App Store Connect listing, privacy answers, screenshots, and review submission.
4. For ad-hoc or enterprise distribution, select the matching distribution method and provisioning profile instead of App Store Connect.

This environment is Linux (Raspberry Pi) and has no Xcode, iOS SDK, simulator, or Swift toolchain, so the commands above could not be executed here. Run them on macOS before signing or submission.
