# OpenMasjid

An open-source mosque website and native mobile toolkit. One organization, multiple campuses, one versioned public content contract.

**Status:** initial implementation. Demo content is fictional. Configuring and approving a GitHub App is required before live admin publishing works. App Store / Google Play distribution is a separate deployment step.

## Architecture

- **Website:** Astro and TypeScript, static HTML plus progressive enhancement.
- **iOS:** native SwiftUI.
- **Android:** native Kotlin / Jetpack Compose.
- **Content:** validated JSON in `content/site.json`; published at `data/v1/site.json`.
- **Hosting and publisher:** one Cloudflare Worker deployment serves the static website/admin assets and handles GitHub App sign-in, authorization and commits. No database needed.

Public visitors fetch static JSON, not the GitHub API. A publisher outage does not take the published website offline. Admin publishes are Git commits followed by a hosting deployment; a commit is **not** confirmation that the deployment is live.

## Local website

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
npm test
npm run build
npm run dev
```

Content generation fills calculated prayer start times for an extended upcoming period. Explicit timetable uploads override calculated rows. Prayer start times and mosque-specified iqamah/Jumuah times are different: verify schedules with the mosque before publication. Re-publish before the generated timetable expires; native clients must not silently present an expired date as today's schedule.

See component instructions:

- [Website and editor](apps/web/README.md)
- [GitHub App publisher and setup](services/publisher/README.md)
- [iOS app](apps/ios/README.md)
- [Android app](apps/android/README.md)
- [Content contract](docs/CONTRACT.md)
- [Hosting guide](docs/HOSTING.md)
- [Security policy](SECURITY.md)

## Campus support

Organization branding is shared. Each campus has its own address, timezone, prayer settings, timetable, iqamah and Jumuah schedules, and facilities. Events and announcements may target one or more campuses, or all campuses. Version one uses organization-wide repository editors, not campus-scoped editing permissions.

## Ownership and hosting

Each mosque can own its GitHub repository, Cloudflare account, domain, and app-store accounts. An independently registered GitHub App keeps publishing independent too. An operator can offer managed deployments, but the v1 publisher is explicitly **single-repository**, not an unaudited multi-tenant service.

Cloudflare Workers with Static Assets is the primary target: one project serves both the static website and `/api/*` publisher. GitHub Pages and ordinary static servers can still serve the export, but cannot execute the publisher without a separate backend. Free plans have limits and may change. Custom domains and store distribution may cost money; OpenMasjid does not promise unlimited free infrastructure.

## What is shared?

The content schema and design principles are shared. UI is implemented natively for each platform. No webview masquerading as a native app; no shared GitHub token in a browser or app binary.

## Verification and limitations

Tests use deterministic fixtures and mock GitHub only at the network boundary. These are not proof of a live GitHub installation or an App Store approval. Live authentication, installation permissions, deployment routing and redirects must be checked in the operator's real account before inviting editors.

See CI and the component READMEs for platform build commands. iOS builds require macOS/Xcode; Android builds require the Android SDK. No software can be guaranteed vulnerability-free: report issues privately as described in SECURITY.md.

## License

MIT. See [LICENSE](LICENSE).
