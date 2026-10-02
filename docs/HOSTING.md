# Hosting OpenMasjid

## Recommended: one Cloudflare Worker

OpenMasjid's primary deployment is one Cloudflare Workers project with Static Assets:

- `/`, `/admin/`, and `/data/*` are static files served directly from Cloudflare's asset network.
- `/api/*` invokes the publisher Worker.
- One project, domain, Git connection, and deployment contains both parts.

The root `wrangler.toml` defines this routing. Requests matching website assets bypass Worker execution; `/api/*` is explicitly configured with `run_worker_first`. A URL that matches neither an asset nor an API route may fall through to the Worker and return the static asset handler's normal not-found response.

### First deployment from a terminal

From the repository root:

```sh
npm ci
npx wrangler login
npm run deploy:cloudflare
```

This builds the Astro site and deploys it with the Worker. The generated `workers.dev` URL can display the website immediately. Until publisher credentials are configured, `/api/*` fails closed with HTTP 503 and the admin cannot publish remotely.

### Automatic deployment from GitHub

In Cloudflare, connect the GitHub repository to **Workers Builds** and use:

- Production branch: `main`
- Root directory: repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node version: 24

Every push to `main` then builds and deploys automatically. An admin publish creates a GitHub commit, which triggers the same build. A successful commit is not proof that deployment completed; check the Cloudflare deployment before calling the content live.

### Custom domain

Attach the desired hostname to the same Worker under **Settings -> Domains & Routes**. Set `APP_ORIGIN` to that exact HTTPS origin, without a trailing slash, and use the same origin in the GitHub App homepage and callback configuration. No separate Pages project or `/api/*` route is required.

Before public use, replace the fictional demo content with verified mosque information. Fetch `/data/v1/site.json` after deployment to confirm generated content is present.

## Publisher setup

Follow `services/publisher/README.md` to register the GitHub App and add runtime secrets. The website may be deployed before that setup. An unconfigured deployment serves its public static files normally while authenticated publishing remains unavailable.

## Free-tier behavior

Static asset requests are free and unlimited under Cloudflare's current Workers Static Assets billing documentation, and asset storage has no additional charge. `/api/*` requests invoke Worker code and count against the Workers plan. Workers Builds has its own build-minute and concurrency limits. Limits and pricing can change, so verify Cloudflare's current documentation before production rollout.

This combined setup generally uses fewer moving parts than separate Pages and Worker projects. It does not cause ordinary website visits to consume Worker-request quota because only `/api/*` runs Worker-first.

## Other static hosts

Run `npm ci && npm run build`, then publish `apps/web/dist`. GitHub Pages and ordinary static servers can serve the public website, but cannot run the publisher. Secure GitHub App publishing then requires a separate compatible Worker/backend, while local export/import and direct Git edits remain available.

## Local hardware

Serve `apps/web/dist` with a normal static web server. Public access additionally requires DNS, HTTPS, firewall/router configuration, uptime, and a compatible publisher if remote editing is required. Native release apps expect HTTPS website URLs.

## Moving providers

Keep the domain under mosque control. Export the website/content/media, deploy on the new host, and verify URLs and headers before changing DNS. Reconfigure the publisher callback/origin and GitHub App settings if its origin changes. Keep the public schema compatible with installed mobile clients; breaking changes need a versioned endpoint and client migration.
