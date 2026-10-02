# OpenMasjid GitHub App publisher

This Worker is the authenticated editor backend for one configured GitHub repository. The same Cloudflare deployment also serves the built website through Workers Static Assets. A successful publish response means only that GitHub accepted a commit; verify the following Cloudflare build before calling content live.

## Register the GitHub App manually

1. In the owning GitHub account, open Settings -> Developer settings -> GitHub Apps -> New GitHub App.
2. Set the Homepage URL to the exact public `APP_ORIGIN`.
3. Set the Authorization callback URL to exactly `https://YOUR_ORIGIN/api/auth/callback` (no trailing slash, path proxy included).
4. Enable “Request user authorization (OAuth) during installation”. The client ID and client secret belong to this OAuth flow. Do not put either secret in browser code.
5. Generate and retain the private key. The Worker accepts GitHub's PEM `PRIVATE KEY` (PKCS#8) and `RSA PRIVATE KEY` (PKCS#1), converting PKCS#1 to PKCS#8 in memory with WebCrypto. Never commit the key.
6. Under Repository permissions grant Contents: Read and write. Do not grant more than needed. The installation token is requested for the configured repository and Contents write only.
7. Install the App on the exact owner/repository configured below. Installation permission is not sufficient: each signing-in GitHub user must have push-capable permission on that repository.

## Configure and deploy

Required values are `APP_ORIGIN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_INSTALLATION_ID`, `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_PRIVATE_KEY`, and `SESSION_SECRET`. Use a long random `SESSION_SECRET`; changing it invalidates all cookies. Store secrets with `wrangler secret put`, not in `wrangler.toml` or source control:

Run all Wrangler and deployment commands below from the repository root.

```text
wrangler secret put APP_ORIGIN
wrangler secret put GITHUB_OWNER
wrangler secret put GITHUB_REPO
wrangler secret put GITHUB_BRANCH
wrangler secret put GITHUB_INSTALLATION_ID
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_PRIVATE_KEY
wrangler secret put SESSION_SECRET
npm run deploy:cloudflare
```

The Worker owns `/api/*` and has no multi-tenant claim. Repository, branch, owner, and the fixed path `content/site.json` are server configuration; clients cannot override them. An unconfigured Worker returns 503 and never pretends to save.

## Same-origin routing

The root `wrangler.toml` deploys the website and publisher together. Static assets serve the website while `/api/*` runs the Worker, all under the same origin. Attach the custom domain to this single Worker and set `APP_ORIGIN` to its exact HTTPS origin. Do not add wildcard CORS or insecure cookies.

## Secure local development

Use HTTPS on a local hostname (for example, a trusted `localhost` TLS proxy) because production cookies are Secure. Register that exact HTTPS callback temporarily in a development GitHub App, use a separate installation and secrets, build the site, and run `wrangler dev --local`. Do not use production credentials or a public tunnel without rotating its secrets.

The Worker enforces encrypted, authenticated HttpOnly Secure SameSite=Lax cookies, expiring OAuth state with PKCE, exact callback authority, exact Origin on state-changing routes, session-bound CSRF, bounded GitHub responses/timeouts, per-request user push authorization, optimistic SHA conflict detection, strict content validation, and generic error responses. Provider access tokens are held only inside the encrypted session cookie and expire no later than the provider expiry; they are never sent to browser JavaScript.
