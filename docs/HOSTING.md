# Hosting OpenMasjid

## Cloudflare Pages: public website

1. Create a repository from OpenMasjid under the mosque's GitHub account/organization.
2. Connect that repository to Cloudflare Pages through Cloudflare's Git integration.
3. Build from the repository root with `npm run build`; output directory: `apps/web/dist`.
4. Select Node 24 for builds. `npm ci` installs dependencies using the committed lockfile.
5. Change fictional demo content to the mosque's verified content before public use.
6. Deploy and fetch `/data/v1/site.json` to verify the generated content is present.
7. Add a mosque-controlled domain if desired. No custom domain is necessary for testing.

These steps deploy **public reading**, not authenticated editing. Follow the publisher README for GitHub App registration and secret configuration. A custom-domain Worker route for `/api/*` can provide same-origin admin authentication while Pages serves the static frontend. A `pages.dev` hostname alone does not grant control over Worker routes for that domain. Do not claim admin publishing is configured merely because the public website loads.

Use the publisher's documented development and production routing setup. Cross-origin configurations need explicit origin checks, credentialed CORS and browser cookie compatibility; do not use a wildcard CORS origin or loosen cookie security to make an unsupported topology appear to work.

The authenticated publisher should return a commit identifier. The hosting provider then builds and deploys that commit. Check deployment status before promising it is live. Failed validation/build leaves the previous deployment active. Public clients can additionally retain their last known good timetable offline.

## GitHub Pages or another static host

Run `npm ci && npm run build`, then publish the contents of `apps/web/dist`. Configure the web project's base path if deploying under `/repository-name/`; see its README. A normal static web server also works. Do not rely on custom server rewrites just to load public JSON.

GitHub Pages cannot run the publisher. The website can remain there, but secure GitHub App publishing needs a separate backend. Export/import and direct Git edits remain possible without an online publisher.

## Local hardware

Serve the same static export using a normal static web server. LAN hosting and public internet hosting are different: public access requires appropriate DNS, HTTPS, firewall/router configuration and uptime. The native release apps expect HTTPS website URLs. Full independence from GitHub requires a separate local publishing mechanism, not merely moving the public files.

## Budgets

Static reads, dynamic function calls and builds are separate quotas. Frequent admin publishes consume deployment/build capacity even if each content file is small. Avoid unnecessary preview builds and publish batches of edits deliberately. Never assume the free allowance for one project repeats per project in the same account. Hosting many mosques centrally aggregates account usage.

Cloudflare Pages, Workers Builds and Workers execution are different products: check each current limit before enabling it. No free-forever or unlimited-mosque guarantee is made. Exceeding a free limit may block operations rather than automatically upgrade the account. A paid plan may have metered overages; understand it before enrolling.

## Moving providers

Keep the domain under mosque control. Export the website/content/media, deploy on the new host and verify URLs and headers before changing DNS. Reconfigure the publisher callback/origin and its GitHub App settings if its origin changes. Keep the public schema compatible with installed mobile clients; breaking changes need a versioned endpoint and client migration.
