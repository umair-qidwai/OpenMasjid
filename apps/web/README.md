# OpenMasjid web

Astro 7.3.5 static public site and browser-based publisher workspace for the OpenMasjid v1 contract.

## Scripts

From the repository root (after the parent workspace installs dependencies):

- `npm run dev --workspace @openmasjid/web`
- `npm run build --workspace @openmasjid/web`
- `npm run check --workspace @openmasjid/web`

The public document is served at `/data/v1/site.json` and bundled into the static page for fast first render. The demo content is explicitly fictional. Replace it through the content publisher before deploying live.

## Admin publishing

`/admin/` edits an in-memory draft and offers JSON backup/export plus CSV timetable import. Save local draft writes only to browser local storage. Publish remains disabled until `PUBLIC_PUBLISHER_URL` is configured; when configured it uses the contract's `/api/session`, `/api/content`, and `/api/publish` endpoints, credentials, CSRF token, exact current SHA, and reports stale conflicts rather than overwriting them.

The recommended deployment is same-origin Worker routes at `/api/*`. For a cross-origin publisher, set an exact `PUBLIC_PUBLISHER_URL` and configure matching credentials/CORS server-side; never expose GitHub credentials in this app.

## Notes

- All user content is inserted as text; no user HTML is rendered.
- Relative logo/media paths are allow-listed; HTTPS is expected for external URLs by the shared core schema.
- Campus selection is reflected in the URL and remembered locally.
- The layout uses ivory, forest, brass, editorial serif typography, arch geometry, progressive reveal, and a reduced-motion fallback.
- Prayer times display the selected campus timetable and fixed iqamah schedule. The publisher owns generated/calculated timetable rows; this app does not invent missing rows.
