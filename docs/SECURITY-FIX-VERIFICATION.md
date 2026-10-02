OpenMasjid security-fix verification

Scope
- Changed only services/publisher/, tests/publisher/, apps/ios/, apps/android/, and this verification document.
- No web, root application, dependency, or workflow files were changed.
- No commits or pushes were made. No secrets were added.

Finding-by-finding

1. Publisher bounded request/upstream reads (high)
- Replaced whole-body text() reads with a byte-counting stream reader.
- Enforces Content-Length when present and enforces the limit while consuming chunked bodies; oversized readers are cancelled.
- Applied to publish requests and GitHub/API responses, including OAuth token responses.
- Added a chunked no-Content-Length oversized-stream regression test.

2. Separate Set-Cookie values (medium)
- OAuth callback now appends the session cookie and OAuth-cookie deletion as separate Set-Cookie header values.
- The OAuth cookie is therefore cleared independently rather than being parsed as attributes of the session cookie.
- Login coverage asserts the OAuth browser cookie and PKCE redirect parameters.

3. GitHub UTF-8 decoding (medium)
- GitHub base64 content is converted to bytes, size-checked, then decoded with fatal UTF-8 before JSON parsing.
- Added a non-ASCII mosque-name round-trip test.

4. Native cache isolation (medium)
- iOS cache keys use a normalized HTTPS website base including its path.
- Android cache keys use the normalized HTTPS base including its path.
- Android URL normalization also rejects credentials, query strings, fragments, and non-HTTPS bases.
- Native cache switching/offline behavior is covered in the implementation design, but native test execution is blocked on this Linux host; see blockers.

5. Native bounded reads (high/medium)
- iOS checks Content-Length and consumes URLSession async bytes with a 1 MiB hard bound before decoding.
- Android checks Content-Length, reads in bounded chunks, closes the input stream, and disconnects the connection in finally.

6. iOS refresh race (medium)
- iOS cancels the prior load task and uses a monotonically increasing generation check before state/cache writes.
- SiteStore is MainActor isolated for state and completion correctness.

7. Android connection lifecycle and force behavior (medium)
- Android now disconnects every connection in finally and closes the response stream through use.
- force now explicitly requests Cache-Control: no-cache.

8. Native validator parity and logo safety (medium)
- iOS and Android enforce shared collection bounds, text/email limits, duplicate IDs, duplicate timetable dates, campus references, timestamp ordering, timezone/coordinate limits, strict logo paths, and HTTPS URL restrictions.
- Protocol-relative and traversal-like logo paths are rejected.
- Android tests cover protocol-relative logo rejection, duplicate timetable dates, and duplicate event IDs. iOS tests cover protocol-relative logo rejection and path-preserving endpoint construction.

9. Campus-local Android event formatting (low)
- Event timestamps are formatted with the selected campus IANA timezone instead of the device default timezone.

False-positive / review notes
- The reviewer described OAuth browser binding as a gap. The existing implementation already sealed a random browser binding inside the short-lived OAuth cookie and compared the callback state to that cookie; this was retained and coverage was added rather than replacing it with an unrelated mechanism.
- The reviewer described force as unused. It was unused before this change; it now controls an explicit no-cache request header.

Verification output
- npm run test:publisher: PASS, 1 file / 9 tests.
- npm run check: PASS (tsc --noEmit).
- npm test: PASS, 5 files / 36 tests.
- Android domain Gradle test: not verified. The bundled JDK runs, but Gradle test invocations exceeded the available execution timeout without producing a completion result.
- iOS tests/build: not run. Swift/Xcode is unavailable on this Linux host. The iOS implementation targets the package's declared iOS 17 platform and uses URLSession async bytes, available for that target; no Linux build claim is made.

Remaining blockers
- Native iOS and Android compilation/test execution require their respective native toolchains and should be run on macOS/Xcode and a working Android Gradle environment.
- The publisher tests cover the implemented login/PKCE and bounded/encoding paths; a platform-integrated GitHub OAuth round trip still requires a generated test RSA key and mocked GitHub contract harness in a future test-only expansion. No production credential was used here.

Factual corrections for the bounded native follow-up
- iOS now rejects absolute HTTPS URLs with user/password credentials, whitespace, backslashes, or more than 2048 characters; relative logo paths remain bounded to 512 characters.
- iOS now applies the shared non-empty/max-length text rules to organization, campus, facility, jumuah, event, and announcement fields; validates optional prayer-row iqamah values; and enforces unique, valid campus references in event and announcement arrays.
- iOS timestamps now require the shared offset-bearing ISO-8601 shape, a supported 1900–2200 calendar date, and the 40-character limit.
- Android `updatedAt` now requires the shared offset-bearing ISO-8601 shape, a supported 1900–2200 calendar date, and the 40-character limit.
- Regression tests were added before implementation for iOS URL/text/collection cases and Android `updatedAt` cases.
- The iOS regression tests were not run because `swift` is unavailable on this host. The Android targeted test was attempted with the repository-bundled JDK at `apps/android/.tooling/.../bin/java` but Gradle did not complete within the foreground timeout. No native test pass or compile claim is made.
- No npm installs, commits, or pushes were performed.
