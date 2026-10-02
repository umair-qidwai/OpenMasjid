# Browser verification report

Scope: production static output only. Native iOS/Android are documented in `docs/TESTING.md` and remain unverified on this Linux host.

## Acceptance command

```sh
npm run check
npm test
npm run build
npm run test:e2e -- --project=mobile --workers=1 --timeout=120000 --reporter=line
npm run test:e2e -- --project=desktop --workers=1 --timeout=120000 --reporter=line
```

Playwright uses `/usr/bin/chromium` by default (override with `CHROMIUM_PATH`) and starts Astro preview, not Astro dev SSR. The build publishes `apps/web/public/data/v1/site.json` before generating the static shell. No npm install, browser download, commit, or push was used.

## Latest results

- `npm run check`: passed.
- `npm test`: 5 test files, 36 tests passed.
- `npm run build`: passed; published 2 campuses and 800 prayer rows; generated static `/index.html` and `/admin/index.html`.
- Mobile 360px project: 13 tests passed with one worker.
- Desktop 1440px project: 13 tests passed with one worker.
- Total browser tests: 26 passed.
- Production screenshots inspected:
  - `test-results/public-home-mobile-360.png`
  - `/tmp/openmasjid-public-home-desktop-1440.png` (copied outside Playwright's cleaned output directory)

The visual inspection found no visible clipping or horizontal overflow in either captured public page. The automated checks also passed reduced-motion, overflow, console-exception, keyboard, admin CRUD, local draft reload persistence, JSON/CSV rejection, JSON backup download, and unavailable-publisher behavior.

## Fixes verified

- The public shell fetches `data/v1/site.json` at runtime using a base-relative URL. It does not depend on Astro server `searchParams` for campus state.
- Campus resolution gives the URL query value precedence over localStorage, validates both against published campuses, updates both URL and localStorage, and survives reload.
- Campus changes update prayer/Jumuah/facility/contact content and filter events/announcements by global or selected-campus scope.
- Community controls explicitly filter All, Announcements, and Events. No invented filter requirement was added beyond the existing verification defect.
- Admin drafts are loaded only after strict schema validation; invalid stored drafts are discarded. Organization fields are restored from a validated draft after reload.
- Admin save, add/edit/remove campus and content, JSON backup, JSON import rejection, CSV rejection, and publisher-unavailable paths were exercised against the built preview. No fake committed result is shown when the publisher is unavailable.
- Root/base-relative asset and data paths are used. No CSP metadata/header mismatch was present in the owned web code, so no unsafe-inline CSP change was needed.

## Earlier run

A previous browser run timed out and is not counted as passing. It exposed the campus-selection/localStorage race, missing community filters, and an admin organization draft reload defect. Those paths are covered by the passing rerun above. The earlier strict text locator was also corrected to target the unique brand link.

Native iOS and Android compilation, simulator/emulator execution, and physical-device execution were not run and must not be reported as verified here.
