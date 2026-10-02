# Verification

Run date: 2026-10-02 (host clock)

Scope: core, content publication, tools, root configuration/CI, and apps/web. Publisher implementation/tests and native source were not edited.

Successes

- `npm ci --fetch-timeout=600000 --fetch-retries=3 --maxsockets=1` completed after approximately seven minutes: 335 packages added, 339 audited, 0 vulnerabilities reported. The earlier normal install attempt was diagnosed as registry instability: multiple registry tarball requests returned `ECONNRESET` and individual downloads took 254–440 seconds. `npm ci --offline` was also attempted and correctly stopped on an uncached tarball.
- `npm view astro@7.3.5 version --fetch-timeout=30000 --fetch-retries=0` returned `7.3.5`.
- `npm run check` passed (`tsc --noEmit`).
- `npm test` passed: 4 test files, 27 tests.
- `npm run build` passed. Content publication reported 2 campuses and 800 prayer rows (400 per campus) and Astro generated `/admin/index.html` and `/index.html`.
- Publication output is atomically written after strict validation to `apps/web/public/data/v1/site.json`; the generated source copy used by Astro is `apps/web/src/lib/site.json`. Uploaded timetable rows are retained and calculated rows cover 400 campus-local days.
- Source validation, calendar/time validation, strict fields, safe URL validation, CSV duplicate/invalid-row rejection, and expired/future announcement filtering are covered by tests or shared validation.
- Root TypeScript configuration, npm workspace dependency forms, secure static headers/CSP, and four GitHub workflows were added.

Not run / blockers

- Playwright browser verification was not run. No 360px/desktop screenshots, keyboard interaction audit, overflow audit, or console-error audit is claimed.
- iOS Swift package/XcodeGen/Xcodebuild workflow was added but cannot execute on this Linux ARM64 host because Xcode/iOS Simulator are unavailable.
- Android domain/debug workflow was added but was not executed locally; the local Android SDK/platform-35 environment was not verified.
- `npm run test:publisher` remains outside this work's ownership boundary and was observed failing before these changes: `tests/publisher/publisher.test.ts` expected 503 but received 403. `services/publisher` and `tests/publisher` were not edited.
- No commit or push was performed.
