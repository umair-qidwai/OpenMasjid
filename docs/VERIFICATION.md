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
- Native iOS CI passed on GitHub run 37011396486: 11 Swift tests passed, XcodeGen generated the project, and the unsigned iPhone 15 simulator app build passed. This is a compiled simulator-target verification; no physical iPhone execution, signing, provisioning, or App Store archive was performed.
- Native Android CI passed on GitHub run 37011396466: all 15 domain unit tests passed and `:app:assembleDebug` passed with Android SDK platform 35. This is a compile/package verification; no emulator or physical-device execution/install was performed.
- `npm run test:publisher` remains outside this work's ownership boundary and was observed failing before these changes: `tests/publisher/publisher.test.ts` expected 503 but received 403. `services/publisher` and `tests/publisher` were not edited.
- Native CI fixes were pushed directly to `main` in commits `ff8f39a`, `2c8e415`, `6c31c94`, `ec7ff94`, `94c2f25`, `b8a0de4`, `5c5f417`, and `1daf2b2`.
